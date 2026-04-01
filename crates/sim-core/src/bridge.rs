use serde::{Deserialize, Serialize};

use crate::analyzer::{AnalyzerDefinition, TrajectorySample};
use crate::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use crate::entity::{EntityDefinition, ShapeDefinition, Vector2};
use crate::force::ForceSourceDefinition;
use crate::playback::{
    InvalidPlaybackConfig, PRECOMPUTE_CHUNK_STEPS, PlaybackConfig, PlaybackMode, PrecomputeSession,
    PreparedPlayback,
};
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use crate::scene::{CompileSceneRequest, CompiledScene, SceneCompileError, compile_scene};

#[derive(Debug, Clone, PartialEq)]
pub enum BridgeError {
    DirtySceneRequiresRebuild,
    IncompleteAnalyzerRecord {
        id: String,
        kind: String,
        missing_field: String,
    },
    IncompleteEntityRecord {
        id: String,
        kind: String,
        missing_field: String,
    },
    InvalidTimeScale {
        value: f64,
    },
    InvalidPlaybackConfig {
        field: &'static str,
        value: f64,
    },
    InvalidSeekTime {
        value: f64,
    },
    PlaybackCacheNotReady,
    PlaybackConfigLockedWhileActive,
    RuntimeNotInitialized,
    UnknownAnalyzer {
        id: String,
    },
    UnsupportedSceneRecord {
        section: String,
        record: SceneKindRecord,
    },
    SceneCompile(SceneCompileError),
}

#[derive(Debug, Clone)]
pub struct SimulationBridge {
    base_delta_seconds: f64,
    time_scale: f64,
    playback_config: PlaybackConfig,
    compiled_scene: Option<CompiledScene>,
    runtime: Option<RuntimeScene>,
    precompute_session: Option<PrecomputeSession>,
    prepared_playback: Option<PreparedPlayback>,
    playback_cursor_frame: usize,
    playback_cursor_phase: f64,
    dirty_scopes: Vec<DirtyEditScope>,
    status: BridgeStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeStatus {
    Idle,
    Running,
    Preparing,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeBlockReason {
    RebuildRequired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatusSnapshot {
    pub status: BridgeStatus,
    pub current_frame: Option<RuntimeFramePayload>,
    pub current_time_seconds: f64,
    pub time_scale: f64,
    pub playback_mode: PlaybackMode,
    pub total_duration_seconds: f64,
    pub preparing_progress: Option<f64>,
    pub seekable: bool,
    pub dirty_scopes: Vec<DirtyEditScope>,
    pub rebuild_required: bool,
    pub can_resume: bool,
    pub block_reason: Option<BridgeBlockReason>,
}

impl SimulationBridge {
    pub fn new(fixed_delta_seconds: f64) -> Self {
        Self {
            base_delta_seconds: fixed_delta_seconds.max(f64::EPSILON),
            time_scale: 1.0,
            playback_config: PlaybackConfig::default(),
            compiled_scene: None,
            runtime: None,
            precompute_session: None,
            prepared_playback: None,
            playback_cursor_frame: 0,
            playback_cursor_phase: 0.0,
            dirty_scopes: Vec::new(),
            status: BridgeStatus::Idle,
        }
    }

    pub fn compile_scene(
        &mut self,
        request: CompileSceneRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        let compiled_scene = compile_scene(&request).map_err(BridgeError::SceneCompile)?;
        let runtime = RuntimeScene::new(compiled_scene.clone(), self.fixed_delta_seconds());
        let frame = runtime.current_frame();

        self.compiled_scene = Some(compiled_scene);
        self.runtime = Some(runtime);
        self.clear_precomputed_playback();
        self.dirty_scopes.clear();
        self.status = BridgeStatus::Idle;

        Ok(frame)
    }

    pub fn compile_runtime_request(
        &mut self,
        request: RuntimeCompileRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        self.compile_scene(request.into_compile_scene_request()?)
    }

    pub fn compile_scene_snapshot(
        &mut self,
        request: CompileSceneRequest,
    ) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.compile_scene(request)?;
        Ok(self.status_snapshot())
    }

    pub fn compile_runtime_request_snapshot(
        &mut self,
        request: RuntimeCompileRequest,
    ) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.compile_runtime_request(request)?;
        Ok(self.status_snapshot())
    }

    pub fn start_or_resume(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.guard_runtime_ready()?;

        match self.playback_config.mode {
            PlaybackMode::Realtime => {
                if self.realtime_has_reached_duration_cap() {
                    self.restore_runtime_baseline()?;
                }

                self.status = BridgeStatus::Running;
            }
            PlaybackMode::Precomputed => {
                if self.prepared_playback.is_none() {
                    if self.precompute_session.is_none() {
                        self.begin_precompute_session()?;
                    }

                    self.status = BridgeStatus::Preparing;
                    return self.current_frame();
                }

                if self.playback_cursor_is_at_end() {
                    self.playback_cursor_frame = 0;
                    self.playback_cursor_phase = 0.0;
                }

                self.status = BridgeStatus::Running;
            }
        }

        self.current_frame()
    }

    pub fn start_or_resume_snapshot(&mut self) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.start_or_resume()?;
        Ok(self.status_snapshot())
    }

    pub fn pause(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.ensure_runtime_initialized()?;
        self.status = BridgeStatus::Paused;
        self.current_frame()
    }

    pub fn pause_snapshot(&mut self) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.pause()?;
        Ok(self.status_snapshot())
    }

    pub fn step(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.guard_runtime_ready()?;

        if self.playback_config.mode == PlaybackMode::Precomputed {
            if self.prepared_playback.is_none() {
                return Err(BridgeError::PlaybackCacheNotReady);
            }

            self.playback_cursor_phase = 0.0;
            self.advance_cached_cursor_by_steps(1);
            self.status = BridgeStatus::Paused;
            return self.current_frame();
        }

        let runtime = self
            .runtime
            .as_mut()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        Ok(runtime.step())
    }

    pub fn step_snapshot(&mut self) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.step()?;
        Ok(self.status_snapshot())
    }

    pub fn tick_snapshot(&mut self) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.ensure_runtime_initialized()?;

        match self.status {
            BridgeStatus::Running => match self.playback_config.mode {
                PlaybackMode::Realtime => {
                    if !self.realtime_has_reached_duration_cap() {
                        self.step()?;
                    }

                    if self.realtime_has_reached_duration_cap() {
                        self.status = BridgeStatus::Idle;
                    }
                }
                PlaybackMode::Precomputed => {
                    self.advance_cached_cursor_for_tick();
                }
            },
            BridgeStatus::Preparing => {
                self.advance_precompute_session()?;
            }
            BridgeStatus::Idle | BridgeStatus::Paused => {}
        }

        Ok(self.status_snapshot())
    }

    pub fn reset(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.time_scale = 1.0;
        self.restore_runtime_baseline()?;
        self.precompute_session = None;
        self.playback_cursor_phase = 0.0;
        self.dirty_scopes.clear();
        self.status = BridgeStatus::Idle;

        self.current_frame()
    }

    pub fn reset_snapshot(&mut self) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.reset()?;
        Ok(self.status_snapshot())
    }

    pub fn current_frame(&self) -> Result<RuntimeFramePayload, BridgeError> {
        if let Some(frame) = self.cached_current_frame() {
            return Ok(frame);
        }

        let runtime = self
            .runtime
            .as_ref()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        Ok(runtime.current_frame())
    }

    pub fn analyzer_samples(&self, id: &str) -> Result<Vec<TrajectorySample>, BridgeError> {
        if let Some(prepared_playback) = self.prepared_playback.as_ref() {
            return prepared_playback
                .analyzer_samples(id)
                .map(|samples| samples.to_vec())
                .ok_or_else(|| BridgeError::UnknownAnalyzer { id: id.to_string() });
        }

        if let Some(precompute_session) = self.precompute_session.as_ref() {
            return precompute_session
                .analyzer_samples(id)
                .map(|samples| samples.to_vec())
                .ok_or_else(|| BridgeError::UnknownAnalyzer { id: id.to_string() });
        }

        let runtime = self
            .runtime
            .as_ref()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        runtime
            .analyzer_samples(id)
            .map(|samples| samples.to_vec())
            .ok_or_else(|| BridgeError::UnknownAnalyzer { id: id.to_string() })
    }

    pub fn read_trajectory_samples(&self, id: &str) -> Result<Vec<TrajectorySample>, BridgeError> {
        let samples = self.analyzer_samples(id)?;
        let runtime_samples = samples
            .into_iter()
            .filter(|sample| sample.frame_number > 0)
            .collect::<Vec<_>>();

        if runtime_samples.is_empty() {
            return Err(BridgeError::UnknownAnalyzer { id: id.to_string() });
        }

        Ok(runtime_samples)
    }

    pub fn set_time_scale(&mut self, time_scale: f64) -> Result<BridgeStatusSnapshot, BridgeError> {
        if !time_scale.is_finite() || time_scale <= 0.0 {
            return Err(BridgeError::InvalidTimeScale { value: time_scale });
        }

        self.time_scale = time_scale;

        Ok(self.status_snapshot())
    }

    pub fn playback_config(&self) -> &PlaybackConfig {
        &self.playback_config
    }

    pub fn set_playback_config(
        &mut self,
        playback_config: PlaybackConfig,
    ) -> Result<BridgeStatusSnapshot, BridgeError> {
        if matches!(self.status, BridgeStatus::Running | BridgeStatus::Preparing) {
            return Err(BridgeError::PlaybackConfigLockedWhileActive);
        }

        playback_config
            .validate()
            .map_err(|InvalidPlaybackConfig { field, value }| {
                BridgeError::InvalidPlaybackConfig { field, value }
            })?;

        self.playback_config = playback_config;

        if self.runtime.is_some() {
            self.restore_runtime_baseline()?;
        }

        self.clear_precomputed_playback();
        self.status = BridgeStatus::Idle;

        Ok(self.status_snapshot())
    }

    pub fn set_playback_config_snapshot(
        &mut self,
        playback_config: PlaybackConfig,
    ) -> Result<BridgeStatusSnapshot, BridgeError> {
        self.set_playback_config(playback_config)
    }

    pub fn seek_to_time_snapshot(
        &mut self,
        time_seconds: f64,
    ) -> Result<BridgeStatusSnapshot, BridgeError> {
        if !time_seconds.is_finite() || time_seconds < 0.0 {
            return Err(BridgeError::InvalidSeekTime {
                value: time_seconds,
            });
        }

        let prepared_playback = self
            .prepared_playback
            .as_ref()
            .ok_or(BridgeError::PlaybackCacheNotReady)?;
        let frame_index = ((time_seconds / self.fixed_delta_seconds()).round() as usize)
            .min(prepared_playback.last_index());

        self.playback_cursor_frame = frame_index;
        self.playback_cursor_phase = 0.0;
        self.status = BridgeStatus::Paused;

        Ok(self.status_snapshot())
    }

    pub fn mark_dirty(&mut self) -> BridgeStatusSnapshot {
        self.mark_dirty_scopes(&[DirtyEditScope::Structure])
    }

    pub fn mark_dirty_scopes(&mut self, scopes: &[DirtyEditScope]) -> BridgeStatusSnapshot {
        for scope in scopes {
            if !self.dirty_scopes.contains(scope) {
                self.dirty_scopes.push(*scope);
            }
        }

        self.clear_precomputed_playback();
        self.status = if self.runtime.is_some() {
            BridgeStatus::Paused
        } else {
            BridgeStatus::Idle
        };

        self.status_snapshot()
    }

    pub fn is_dirty(&self) -> bool {
        self.rebuild_required()
    }

    pub fn is_running(&self) -> bool {
        self.status == BridgeStatus::Running
    }

    pub fn status_snapshot(&self) -> BridgeStatusSnapshot {
        let rebuild_required = self.rebuild_required();
        let current_time_seconds = self.current_playback_time_seconds();
        let current_frame = self
            .cached_current_frame()
            .or_else(|| self.runtime.as_ref().map(RuntimeScene::current_frame));

        BridgeStatusSnapshot {
            status: self.status,
            current_frame,
            current_time_seconds,
            time_scale: self.time_scale,
            playback_mode: self.playback_config.mode,
            total_duration_seconds: self.playback_config.total_duration_seconds(),
            preparing_progress: self
                .precompute_session
                .as_ref()
                .map(PrecomputeSession::progress),
            seekable: self.prepared_playback.is_some(),
            dirty_scopes: self.dirty_scopes.clone(),
            rebuild_required,
            can_resume: !rebuild_required,
            block_reason: if rebuild_required {
                Some(BridgeBlockReason::RebuildRequired)
            } else {
                None
            },
        }
    }

    fn guard_runtime_ready(&self) -> Result<(), BridgeError> {
        if self.rebuild_required() {
            return Err(BridgeError::DirtySceneRequiresRebuild);
        }

        self.ensure_runtime_initialized()
    }

    fn ensure_runtime_initialized(&self) -> Result<(), BridgeError> {
        if self.runtime.is_some() {
            Ok(())
        } else {
            Err(BridgeError::RuntimeNotInitialized)
        }
    }

    fn rebuild_required(&self) -> bool {
        self.dirty_scopes
            .iter()
            .any(DirtyEditScope::requires_rebuild)
    }

    fn fixed_delta_seconds(&self) -> f64 {
        self.base_delta_seconds
    }

    fn duration_step_count(&self, duration_seconds: f64) -> u64 {
        ((duration_seconds / self.fixed_delta_seconds()).round() as u64).max(1)
    }

    fn realtime_has_reached_duration_cap(&self) -> bool {
        let Some(runtime) = self.runtime.as_ref() else {
            return false;
        };

        runtime.frame_number()
            >= self.duration_step_count(self.playback_config.realtime_duration_seconds)
    }

    fn cached_current_frame(&self) -> Option<RuntimeFramePayload> {
        self.prepared_playback
            .as_ref()
            .and_then(|prepared_playback| prepared_playback.frame(self.playback_cursor_frame))
            .cloned()
    }

    fn current_playback_time_seconds(&self) -> f64 {
        if self.prepared_playback.is_some() {
            return self.playback_cursor_frame as f64 * self.fixed_delta_seconds();
        }

        self.runtime
            .as_ref()
            .map(|runtime| runtime.frame_number() as f64 * self.fixed_delta_seconds())
            .unwrap_or(0.0)
    }

    fn playback_cursor_is_at_end(&self) -> bool {
        self.prepared_playback
            .as_ref()
            .map(|prepared_playback| self.playback_cursor_frame >= prepared_playback.last_index())
            .unwrap_or(false)
    }

    fn clear_precomputed_playback(&mut self) {
        self.precompute_session = None;
        self.prepared_playback = None;
        self.playback_cursor_frame = 0;
        self.playback_cursor_phase = 0.0;
    }

    fn restore_runtime_baseline(&mut self) -> Result<(), BridgeError> {
        let compiled_scene = self
            .compiled_scene
            .clone()
            .ok_or(BridgeError::RuntimeNotInitialized)?;
        self.runtime = Some(RuntimeScene::new(
            compiled_scene,
            self.fixed_delta_seconds(),
        ));
        self.playback_cursor_frame = 0;
        self.playback_cursor_phase = 0.0;
        Ok(())
    }

    fn begin_precompute_session(&mut self) -> Result<(), BridgeError> {
        let compiled_scene = self
            .compiled_scene
            .clone()
            .ok_or(BridgeError::RuntimeNotInitialized)?;
        let total_steps =
            self.duration_step_count(self.playback_config.precompute_duration_seconds);

        self.precompute_session = Some(PrecomputeSession::new(
            RuntimeScene::new(compiled_scene, self.fixed_delta_seconds()),
            total_steps,
        ));
        self.prepared_playback = None;
        self.playback_cursor_frame = 0;
        self.playback_cursor_phase = 0.0;

        Ok(())
    }

    fn advance_precompute_session(&mut self) -> Result<(), BridgeError> {
        let finished = self
            .precompute_session
            .as_mut()
            .ok_or(BridgeError::PlaybackCacheNotReady)?
            .advance(PRECOMPUTE_CHUNK_STEPS);

        if finished {
            let prepared_playback = self
                .precompute_session
                .take()
                .ok_or(BridgeError::PlaybackCacheNotReady)?
                .finalize();
            self.prepared_playback = Some(prepared_playback);
            self.playback_cursor_frame = 0;
            self.playback_cursor_phase = 0.0;
            self.status = BridgeStatus::Running;
        } else {
            self.status = BridgeStatus::Preparing;
        }

        Ok(())
    }

    fn advance_cached_cursor_for_tick(&mut self) {
        self.playback_cursor_phase += self.time_scale;
        let whole_steps = self.playback_cursor_phase.floor() as usize;
        self.playback_cursor_phase -= whole_steps as f64;

        if whole_steps == 0 {
            return;
        }

        self.advance_cached_cursor_by_steps(whole_steps);
        if self.playback_cursor_is_at_end() {
            self.status = BridgeStatus::Idle;
            self.playback_cursor_phase = 0.0;
        }
    }

    fn advance_cached_cursor_by_steps(&mut self, step_count: usize) {
        let Some(prepared_playback) = self.prepared_playback.as_ref() else {
            return;
        };

        self.playback_cursor_frame =
            (self.playback_cursor_frame + step_count).min(prepared_playback.last_index());
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCompileRequest {
    pub scene: SceneDocumentPayload,
    pub dirty_scopes: Vec<DirtyEditScope>,
    pub rebuild_required: bool,
}

impl RuntimeCompileRequest {
    pub fn into_compile_scene_request(self) -> Result<CompileSceneRequest, BridgeError> {
        let analyzers = self
            .scene
            .analyzers
            .into_iter()
            .map(SceneAnalyzerRecord::into_analyzer_definition)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(CompileSceneRequest {
            entities: self
                .scene
                .entities
                .into_iter()
                .map(SceneEntityPayload::into_entity_definition)
                .collect::<Result<Vec<_>, _>>()?,
            constraints: self
                .scene
                .constraints
                .into_iter()
                .map(SceneConstraintPayload::into_constraint_definition)
                .collect(),
            force_sources: self
                .scene
                .force_sources
                .into_iter()
                .map(SceneForceSourcePayload::into_force_source_definition)
                .collect(),
            analyzers,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DirtyEditScope {
    Structure,
    Physics,
    Analysis,
    Annotation,
}

impl DirtyEditScope {
    pub fn requires_rebuild(&self) -> bool {
        matches!(self, Self::Structure | Self::Physics)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneDocumentPayload {
    pub schema_version: u32,
    pub entities: Vec<SceneEntityPayload>,
    pub constraints: Vec<SceneConstraintPayload>,
    pub force_sources: Vec<SceneForceSourcePayload>,
    pub analyzers: Vec<SceneAnalyzerRecord>,
    pub annotations: Vec<AnnotationStrokePayload>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, tag = "kind", rename_all = "kebab-case")]
pub enum SceneConstraintPayload {
    Spring {
        id: String,
        #[serde(rename = "entityAId")]
        entity_a_id: String,
        #[serde(rename = "entityBId")]
        entity_b_id: String,
        #[serde(rename = "restLength")]
        rest_length: f64,
        stiffness: f64,
    },
    Track {
        id: String,
        #[serde(rename = "entityId")]
        entity_id: String,
        origin: Vector2,
        axis: Vector2,
    },
    ArcTrack {
        id: String,
        center: Vector2,
        radius: f64,
        #[serde(rename = "startAngleDegrees")]
        start_angle_degrees: f64,
        #[serde(rename = "endAngleDegrees")]
        end_angle_degrees: f64,
        side: ArcTrackSide,
        #[serde(rename = "entryEndpoint")]
        entry_endpoint: ArcTrackEntryEndpoint,
    },
}

impl SceneConstraintPayload {
    fn into_constraint_definition(self) -> ConstraintDefinition {
        match self {
            Self::Spring {
                id,
                entity_a_id,
                entity_b_id,
                rest_length,
                stiffness,
            } => ConstraintDefinition::Spring {
                id,
                entity_a: entity_a_id,
                entity_b: entity_b_id,
                rest_length,
                stiffness,
            },
            Self::Track {
                id,
                entity_id,
                origin,
                axis,
            } => ConstraintDefinition::Track {
                id,
                entity_id,
                origin,
                axis,
            },
            Self::ArcTrack {
                id,
                center,
                radius,
                start_angle_degrees,
                end_angle_degrees,
                side,
                entry_endpoint,
            } => ConstraintDefinition::ArcTrack {
                id,
                center,
                radius,
                start_angle_degrees,
                end_angle_degrees,
                side,
                entry_endpoint,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SceneForceSourcePayload {
    Gravity { id: String, acceleration: Vector2 },
}

impl SceneForceSourcePayload {
    fn into_force_source_definition(self) -> ForceSourceDefinition {
        match self {
            Self::Gravity { id, acceleration } => {
                ForceSourceDefinition::Gravity { id, acceleration }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneEntityPayload {
    pub id: String,
    pub kind: String,
    pub points: Option<Vec<Vector2>>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub radius: Option<f64>,
    pub rotation_radians: Option<f64>,
    pub mass: Option<f64>,
    pub friction: Option<f64>,
    pub restitution: Option<f64>,
    pub locked: Option<bool>,
    pub velocity_x: Option<f64>,
    pub velocity_y: Option<f64>,
}

impl SceneEntityPayload {
    fn into_entity_definition(self) -> Result<EntityDefinition, BridgeError> {
        let SceneEntityPayload {
            id,
            kind,
            points,
            x,
            y,
            width,
            height,
            radius,
            rotation_radians,
            mass,
            friction,
            restitution,
            locked,
            velocity_x,
            velocity_y,
        } = self;

        let (shape, position, defaults) = match kind.as_str() {
            "user-polygon" => {
                let points = points.ok_or_else(|| BridgeError::IncompleteEntityRecord {
                    id: id.clone(),
                    kind: kind.clone(),
                    missing_field: "points".to_string(),
                })?;
                let centroid = polygon_centroid(&points);
                let local_points = points
                    .into_iter()
                    .map(|point| point.sub(centroid))
                    .collect::<Vec<_>>();

                (
                    ShapeDefinition::ConvexPolygon {
                        points: local_points,
                    },
                    centroid,
                    EntityPhysicsDefaults {
                        mass: 0.0,
                        friction: 0.6,
                        restitution: 0.0,
                        locked: true,
                    },
                )
            }
            "ball" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let radius = required_scalar(&id, &kind, "radius", radius)?;

                (
                    ShapeDefinition::Ball { radius },
                    Vector2::new(x + radius, y + radius),
                    EntityPhysicsDefaults::dynamic(),
                )
            }
            "block" | "board" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let width = required_scalar(&id, &kind, "width", width)?;
                let height = required_scalar(&id, &kind, "height", height)?;

                (
                    ShapeDefinition::Block { width, height },
                    Vector2::new(x + width * 0.5, y + height * 0.5),
                    EntityPhysicsDefaults::dynamic(),
                )
            }
            "polygon" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let width = required_scalar(&id, &kind, "width", width)?;
                let height = required_scalar(&id, &kind, "height", height)?;

                (
                    ShapeDefinition::ConvexPolygon {
                        points: rectangle_points(width, height),
                    },
                    Vector2::new(x + width * 0.5, y + height * 0.5),
                    EntityPhysicsDefaults::dynamic(),
                )
            }
            _ => (
                ShapeDefinition::Unsupported { kind: kind.clone() },
                Vector2::ZERO,
                EntityPhysicsDefaults::dynamic(),
            ),
        };

        Ok(EntityDefinition {
            id,
            shape,
            position,
            rotation_radians: rotation_radians.unwrap_or(0.0),
            initial_velocity: Vector2::new(velocity_x.unwrap_or(0.0), velocity_y.unwrap_or(0.0)),
            mass: mass.unwrap_or(defaults.mass),
            is_static: locked.unwrap_or(defaults.locked),
            friction_coefficient: friction.unwrap_or(defaults.friction),
            restitution_coefficient: restitution.unwrap_or(defaults.restitution),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneKindRecord {
    pub id: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneAnalyzerRecord {
    pub id: String,
    pub kind: String,
    pub entity_id: Option<String>,
}

impl SceneAnalyzerRecord {
    fn into_analyzer_definition(self) -> Result<AnalyzerDefinition, BridgeError> {
        let SceneAnalyzerRecord {
            id,
            kind,
            entity_id,
        } = self;

        match kind.as_str() {
            "trajectory" => Ok(AnalyzerDefinition::Trajectory {
                id: id.clone(),
                entity_id: entity_id.ok_or_else(|| BridgeError::IncompleteAnalyzerRecord {
                    id,
                    kind,
                    missing_field: "entityId".to_string(),
                })?,
            }),
            _ => Err(BridgeError::UnsupportedSceneRecord {
                section: "analyzers".to_string(),
                record: SceneKindRecord { id, kind },
            }),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationStrokePayload {
    pub id: String,
    pub points: Vec<Vector2>,
}

#[derive(Debug, Clone, Copy)]
struct EntityPhysicsDefaults {
    mass: f64,
    friction: f64,
    restitution: f64,
    locked: bool,
}

impl EntityPhysicsDefaults {
    fn dynamic() -> Self {
        Self {
            mass: 1.0,
            friction: 0.2,
            restitution: 1.0,
            locked: false,
        }
    }
}

fn polygon_centroid(points: &[Vector2]) -> Vector2 {
    if points.is_empty() {
        return Vector2::ZERO;
    }

    let sum = points
        .iter()
        .copied()
        .fold(Vector2::ZERO, |accumulator, point| accumulator.add(point));

    sum.scale(1.0 / points.len() as f64)
}

fn rectangle_points(width: f64, height: f64) -> Vec<Vector2> {
    vec![
        Vector2::new(-width * 0.5, -height * 0.5),
        Vector2::new(width * 0.5, -height * 0.5),
        Vector2::new(width * 0.5, height * 0.5),
        Vector2::new(-width * 0.5, height * 0.5),
    ]
}

fn required_scalar(
    id: &str,
    kind: &str,
    field: &str,
    value: Option<f64>,
) -> Result<f64, BridgeError> {
    value.ok_or_else(|| BridgeError::IncompleteEntityRecord {
        id: id.to_string(),
        kind: kind.to_string(),
        missing_field: field.to_string(),
    })
}
