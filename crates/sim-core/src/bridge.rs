use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::analyzer::{AnalyzerDefinition, TrajectorySample};
use crate::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS,
};
use crate::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use crate::entity::{EntityDefinition, ShapeDefinition, Vector2};
use crate::force::ForceSourceDefinition;
use crate::guide_runtime::RuntimeGuideState;
use crate::playback::{
    InvalidPlaybackConfig, PRECOMPUTE_CHUNK_STEPS, PlaybackConfig, PlaybackMode, PrecomputeSession,
    PreparedPlayback,
};
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use crate::scene::{
    CompileSceneRequest, CompiledScene, SceneCompileError, compile_scene,
    compile_scene_with_arc_track_metadata,
};

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
    EntityPayloadKindMismatch {
        id: String,
        expected_kind: String,
        actual_kind: String,
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
    pub guide_states: Vec<BridgeGuideStateSnapshot>,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "guideState", rename_all = "kebab-case")]
pub enum BridgeGuideStateSnapshot {
    Free {
        #[serde(rename = "entityId")]
        entity_id: String,
    },
    Attached {
        #[serde(rename = "entityId")]
        entity_id: String,
        #[serde(rename = "guideSegmentId")]
        guide_segment_id: String,
        #[serde(rename = "guideProgress")]
        guide_progress: f64,
        #[serde(rename = "guideSpeed")]
        guide_speed: f64,
    },
}

impl SimulationBridge {
    fn install_compiled_scene(&mut self, compiled_scene: CompiledScene) -> RuntimeFramePayload {
        let runtime = RuntimeScene::new(compiled_scene.clone(), self.fixed_delta_seconds());
        let frame = runtime.current_frame();

        self.compiled_scene = Some(compiled_scene);
        self.runtime = Some(runtime);
        self.clear_precomputed_playback();
        self.dirty_scopes.clear();
        self.status = BridgeStatus::Idle;

        frame
    }

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

        Ok(self.install_compiled_scene(compiled_scene))
    }

    pub fn compile_runtime_request(
        &mut self,
        request: RuntimeCompileRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        let compiled_scene = request.into_compiled_scene()?;

        Ok(self.install_compiled_scene(compiled_scene))
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

        Ok(samples
            .into_iter()
            .filter(|sample| sample.frame_number > 0)
            .collect::<Vec<_>>())
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
        let guide_states = match (&current_frame, self.playback_config.mode) {
            (Some(frame), PlaybackMode::Realtime) => {
                read_bridge_guide_states(self.runtime.as_ref(), frame)
            }
            _ => Vec::new(),
        };

        BridgeStatusSnapshot {
            status: self.status,
            current_frame,
            guide_states,
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

fn read_bridge_guide_states(
    runtime: Option<&RuntimeScene>,
    frame: &RuntimeFramePayload,
) -> Vec<BridgeGuideStateSnapshot> {
    let Some(runtime) = runtime else {
        return Vec::new();
    };

    frame
        .entities
        .iter()
        .map(|entity| match runtime.guide_state(&entity.entity_id) {
            RuntimeGuideState::Free => BridgeGuideStateSnapshot::Free {
                entity_id: entity.entity_id.clone(),
            },
            RuntimeGuideState::OnGuide {
                segment_id,
                progress,
                speed,
            } => BridgeGuideStateSnapshot::Attached {
                entity_id: entity.entity_id.clone(),
                guide_segment_id: segment_id,
                guide_progress: progress,
                guide_speed: speed,
            },
        })
        .collect()
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
        Ok(self.into_compile_scene_parts()?.0)
    }

    pub fn into_compiled_scene(self) -> Result<CompiledScene, BridgeError> {
        let (compile_request, arc_track_metadata_by_id) = self.into_compile_scene_parts()?;

        compile_scene_with_arc_track_metadata(&compile_request, &arc_track_metadata_by_id)
            .map_err(BridgeError::SceneCompile)
    }

    fn into_compile_scene_parts(
        self,
    ) -> Result<
        (
            CompileSceneRequest,
            HashMap<String, ArcTrackEntityCompileMetadata>,
        ),
        BridgeError,
    > {
        let RuntimeCompileRequest { scene, .. } = self;
        let SceneDocumentPayload {
            entities,
            constraints,
            force_sources,
            analyzers,
            ..
        } = scene;
        let arc_track_metadata_by_id = entities
            .iter()
            .filter_map(SceneEntityPayload::compiled_arc_track_metadata)
            .collect::<HashMap<_, _>>();
        let analyzers = analyzers
            .into_iter()
            .map(SceneAnalyzerRecord::into_analyzer_definition)
            .collect::<Result<Vec<_>, _>>()?;

        Ok((
            CompileSceneRequest {
                entities: entities
                    .into_iter()
                    .map(SceneEntityPayload::into_entity_definition)
                    .collect::<Result<Vec<_>, _>>()?,
                constraints: constraints
                    .into_iter()
                    .map(SceneConstraintPayload::into_constraint_definition)
                    .collect(),
                force_sources: force_sources
                    .into_iter()
                    .map(SceneForceSourcePayload::into_force_source_definition)
                    .collect(),
                analyzers,
            },
            arc_track_metadata_by_id,
        ))
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
    pub auto_generated: Option<bool>,
    pub anchor_entity_id: Option<String>,
    pub anchor_entity_kind: Option<String>,
    pub anchor_endpoint: Option<String>,
    pub center: Option<Vector2>,
    #[serde(rename = "centralAngleDegrees")]
    pub central_angle_degrees: Option<f64>,
    pub entry_endpoint: Option<String>,
    pub points: Option<Vec<Vector2>>,
    #[serde(rename = "rotationDegrees")]
    pub rotation_degrees: Option<f64>,
    pub sweep_angle_degrees: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub radius: Option<f64>,
    pub rotation_radians: Option<f64>,
    pub thickness: Option<f64>,
    pub mass: Option<f64>,
    pub friction: Option<f64>,
    pub restitution: Option<f64>,
    pub collision_behavior: Option<String>,
    pub locked: Option<bool>,
    pub velocity_x: Option<f64>,
    pub velocity_y: Option<f64>,
}

impl SceneEntityPayload {
    fn compiled_arc_track_metadata(&self) -> Option<(String, ArcTrackEntityCompileMetadata)> {
        if self.kind != "arc-track" {
            return None;
        }

        let anchor = if self.auto_generated == Some(true) {
            None
        } else {
            match (
                self.anchor_entity_id.as_deref(),
                self.anchor_entity_kind.as_deref(),
                self.anchor_endpoint.as_deref(),
            ) {
                (Some(entity_id), Some(entity_kind), Some(endpoint)) => {
                    Some(CompiledArcTrackAnchor {
                        entity_id: entity_id.to_string(),
                        entity_kind: parse_arc_track_anchor_entity_kind(entity_kind)?,
                        endpoint: parse_arc_track_anchor_endpoint(endpoint)?,
                    })
                }
                _ => None,
            }
        };

        Some((
            self.id.clone(),
            ArcTrackEntityCompileMetadata {
                anchor,
                entry_endpoint: self
                    .entry_endpoint
                    .as_deref()
                    .and_then(parse_arc_track_entry_endpoint),
            },
        ))
    }

    fn into_entity_definition(self) -> Result<EntityDefinition, BridgeError> {
        let SceneEntityPayload {
            id,
            kind,
            auto_generated: _auto_generated,
            anchor_entity_id,
            anchor_entity_kind,
            anchor_endpoint,
            center,
            central_angle_degrees,
            entry_endpoint,
            points,
            rotation_degrees,
            sweep_angle_degrees,
            x,
            y,
            width,
            height,
            radius,
            rotation_radians,
            thickness,
            mass,
            friction,
            restitution,
            collision_behavior: _collision_behavior,
            locked,
            velocity_x,
            velocity_y,
        } = self;

        if kind != "arc-track"
            && looks_like_arc_track_entity_payload(
                anchor_entity_id.as_deref(),
                anchor_entity_kind.as_deref(),
                anchor_endpoint.as_deref(),
                center.as_ref(),
                central_angle_degrees,
                entry_endpoint.as_deref(),
                sweep_angle_degrees,
                thickness,
                rotation_degrees,
            )
        {
            return Err(BridgeError::EntityPayloadKindMismatch {
                id,
                expected_kind: "arc-track".to_string(),
                actual_kind: kind,
            });
        }

        let (shape, position, defaults, compiled_rotation_radians) = match kind.as_str() {
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
                        friction: 0.0,
                        restitution: 0.0,
                        locked: true,
                    },
                    rotation_radians.unwrap_or(0.0),
                )
            }
            "arc-track" => {
                let center = center.ok_or_else(|| BridgeError::IncompleteEntityRecord {
                    id: id.clone(),
                    kind: kind.clone(),
                    missing_field: "center".to_string(),
                })?;
                let radius = required_scalar(&id, &kind, "radius", radius)?;
                let central_angle_degrees = required_arc_track_span_degrees(
                    &id,
                    &kind,
                    sweep_angle_degrees,
                    central_angle_degrees,
                )?;
                let thickness = thickness.unwrap_or(DEFAULT_ARC_TRACK_THICKNESS);
                // Desktop authoring stores the visible guide/contact radius; sim-core stores
                // the rail centerline radius and derives the inside contact path from it.
                let centerline_radius = radius + thickness * 0.5;
                let center_rotation_radians = rotation_degrees
                    .map(f64::to_radians)
                    .or(rotation_radians)
                    .unwrap_or(0.0);
                // Desktop arc-track entities store the bisector rotation. The sim-core arc
                // shape stores the start angle plus a positive sweep.
                let start_rotation_radians =
                    center_rotation_radians - central_angle_degrees.to_radians() * 0.5;

                (
                    ShapeDefinition::ArcTrack {
                        radius: centerline_radius,
                        central_angle_degrees,
                        thickness,
                    },
                    center,
                    EntityPhysicsDefaults {
                        mass: 0.0,
                        friction: 0.0,
                        restitution: 0.0,
                        locked: true,
                    },
                    start_rotation_radians,
                )
            }
            "ball" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let radius = required_scalar(&id, &kind, "radius", radius)?;

                (
                    ShapeDefinition::Ball { radius },
                    Vector2::new(x + radius, y + radius),
                    EntityPhysicsDefaults::dynamic_body(),
                    rotation_radians.unwrap_or(0.0),
                )
            }
            "block" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let width = required_scalar(&id, &kind, "width", width)?;
                let height = required_scalar(&id, &kind, "height", height)?;

                (
                    ShapeDefinition::Block { width, height },
                    Vector2::new(x + width * 0.5, y + height * 0.5),
                    EntityPhysicsDefaults::dynamic_body(),
                    rotation_radians.unwrap_or(0.0),
                )
            }
            "board" => {
                let x = required_scalar(&id, &kind, "x", x)?;
                let y = required_scalar(&id, &kind, "y", y)?;
                let width = required_scalar(&id, &kind, "width", width)?;
                let height = required_scalar(&id, &kind, "height", height)?;

                (
                    ShapeDefinition::Block { width, height },
                    Vector2::new(x + width * 0.5, y + height * 0.5),
                    EntityPhysicsDefaults::board_body(),
                    rotation_radians.unwrap_or(0.0),
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
                    EntityPhysicsDefaults::dynamic_body(),
                    rotation_radians.unwrap_or(0.0),
                )
            }
            _ => (
                ShapeDefinition::Unsupported { kind: kind.clone() },
                Vector2::ZERO,
                EntityPhysicsDefaults::dynamic_body(),
                rotation_radians.unwrap_or(0.0),
            ),
        };

        let is_static = locked.unwrap_or(defaults.locked);

        Ok(EntityDefinition {
            id,
            shape,
            position,
            rotation_radians: compiled_rotation_radians,
            initial_velocity: Vector2::new(velocity_x.unwrap_or(0.0), velocity_y.unwrap_or(0.0)),
            mass: normalize_entity_mass(mass, defaults.mass),
            is_static,
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
    fn dynamic_body() -> Self {
        Self {
            mass: 1.0,
            friction: 0.0,
            restitution: 1.0,
            locked: false,
        }
    }

    fn board_body() -> Self {
        Self {
            mass: 1.0,
            friction: 0.2,
            restitution: 1.0,
            locked: false,
        }
    }
}

fn normalize_entity_mass(value: Option<f64>, default_mass: f64) -> f64 {
    match value {
        Some(mass) if mass.is_finite() && mass > f64::EPSILON => mass,
        _ if default_mass.is_finite() && default_mass > f64::EPSILON => default_mass,
        _ => 0.0,
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

fn required_arc_track_span_degrees(
    id: &str,
    kind: &str,
    sweep_angle_degrees: Option<f64>,
    legacy_central_angle_degrees: Option<f64>,
) -> Result<f64, BridgeError> {
    sweep_angle_degrees
        .or(legacy_central_angle_degrees)
        .ok_or_else(|| BridgeError::IncompleteEntityRecord {
            id: id.to_string(),
            kind: kind.to_string(),
            missing_field: "sweepAngleDegrees".to_string(),
        })
}

fn looks_like_arc_track_entity_payload(
    anchor_entity_id: Option<&str>,
    anchor_entity_kind: Option<&str>,
    anchor_endpoint: Option<&str>,
    center: Option<&Vector2>,
    central_angle_degrees: Option<f64>,
    entry_endpoint: Option<&str>,
    sweep_angle_degrees: Option<f64>,
    thickness: Option<f64>,
    rotation_degrees: Option<f64>,
) -> bool {
    anchor_entity_id.is_some()
        || anchor_entity_kind.is_some()
        || anchor_endpoint.is_some()
        || center.is_some()
        || central_angle_degrees.is_some()
        || entry_endpoint.is_some()
        || sweep_angle_degrees.is_some()
        || thickness.is_some()
        || rotation_degrees.is_some()
}

fn parse_arc_track_anchor_entity_kind(kind: &str) -> Option<ArcTrackAnchorEntityKind> {
    match kind {
        "board" => Some(ArcTrackAnchorEntityKind::Board),
        "block" => Some(ArcTrackAnchorEntityKind::Block),
        _ => None,
    }
}

fn parse_arc_track_anchor_endpoint(endpoint: &str) -> Option<ArcTrackAnchorEndpoint> {
    match endpoint {
        "start" => Some(ArcTrackAnchorEndpoint::Start),
        "end" => Some(ArcTrackAnchorEndpoint::End),
        _ => None,
    }
}

fn parse_arc_track_entry_endpoint(endpoint: &str) -> Option<ArcTrackEntryEndpoint> {
    match endpoint {
        "start" => Some(ArcTrackEntryEndpoint::Start),
        "end" => Some(ArcTrackEntryEndpoint::End),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{BridgeGuideStateSnapshot, RuntimeCompileRequest, SimulationBridge};

    #[test]
    fn board_anchored_arc_track_entity_handoff_keeps_ball_frames_continuous() {
        let request = serde_json::from_value::<RuntimeCompileRequest>(json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball-1",
                        "kind": "ball",
                        "x": 1.44,
                        "y": 1.09,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 2.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "board-1",
                        "kind": "board",
                        "x": 1.47,
                        "y": 1.57,
                        "width": 1.2,
                        "height": 0.18,
                        "mass": 5.0,
                        "friction": 13.0,
                        "restitution": 1.0,
                        "locked": true,
                        "rotationRadians": 0.0,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "arc-track-1",
                        "kind": "arc-track",
                        "anchorEntityId": "board-1",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 2.67, "y": 0.57 },
                        "entryEndpoint": "start",
                        "radius": 1.0,
                        "rotationDegrees": -45.0,
                        "sweepAngleDegrees": 90.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-primary",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": 10.0 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }))
        .expect("runtime compile request deserializes");
        let mut bridge = SimulationBridge::new(1.0 / 60.0);

        let mut snapshot = bridge
            .compile_runtime_request_snapshot(request)
            .expect("scene compiles");
        bridge
            .start_or_resume_snapshot()
            .expect("runtime starts from compiled scene");

        let mut previous_position = snapshot
            .current_frame
            .as_ref()
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.entity_id == "ball-1")
            })
            .map(|entity| entity.position)
            .expect("initial ball frame exists");
        let mut max_frame_distance = 0.0;
        let mut saw_arc_handoff = false;

        for _ in 0..80 {
            snapshot = bridge.tick_snapshot().expect("runtime tick succeeds");
            let ball = snapshot
                .current_frame
                .as_ref()
                .and_then(|frame| {
                    frame
                        .entities
                        .iter()
                        .find(|entity| entity.entity_id == "ball-1")
                })
                .expect("ball frame exists");
            let frame_distance = ball.position.sub(previous_position).length();
            max_frame_distance = f64::max(max_frame_distance, frame_distance);
            previous_position = ball.position;
            saw_arc_handoff |= snapshot.guide_states.iter().any(|guide_state| {
                matches!(
                    guide_state,
                    BridgeGuideStateSnapshot::Attached {
                        entity_id,
                        guide_segment_id,
                        ..
                    } if entity_id == "ball-1" && guide_segment_id == "guide:arc-track-1:arc"
                )
            });
        }

        assert!(saw_arc_handoff, "ball should enter the arc guide");
        assert!(
            max_frame_distance < 0.08,
            "ball frame distance should remain continuous, got {max_frame_distance}"
        );
    }

    #[test]
    fn linear_guide_exit_does_not_reattach_while_moving_outward_from_endpoint() {
        let request = serde_json::from_value::<RuntimeCompileRequest>(json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball-1",
                        "kind": "ball",
                        "x": 1.16,
                        "y": 1.28,
                        "radius": 0.24,
                        "mass": 1.0,
                        "friction": 0.0,
                        "restitution": 0.0,
                        "locked": false,
                        "velocityX": -2.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "board-1",
                        "kind": "board",
                        "x": 1.38,
                        "y": 1.76,
                        "width": 1.2,
                        "height": 0.18,
                        "mass": 5.0,
                        "friction": 0.1,
                        "restitution": 0.0,
                        "locked": true,
                        "rotationRadians": 0.0,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "arc-track-1",
                        "kind": "arc-track",
                        "anchorEntityId": "board-1",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 2.58, "y": 0.76 },
                        "entryEndpoint": "start",
                        "radius": 1.0,
                        "rotationDegrees": -45.0,
                        "sweepAngleDegrees": 90.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-primary",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": 9.8 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }))
        .expect("runtime compile request deserializes");
        let mut bridge = SimulationBridge::new(1.0 / 60.0);

        let mut snapshot = bridge
            .compile_runtime_request_snapshot(request)
            .expect("scene compiles");
        bridge
            .start_or_resume_snapshot()
            .expect("runtime starts from compiled scene");

        let mut previous_x = snapshot
            .current_frame
            .as_ref()
            .and_then(|frame| {
                frame
                    .entities
                    .iter()
                    .find(|entity| entity.entity_id == "ball-1")
            })
            .map(|entity| entity.position.x)
            .expect("initial ball frame exists");
        let mut max_backward_jump: f64 = 0.0;

        for _ in 0..10 {
            snapshot = bridge.tick_snapshot().expect("runtime tick succeeds");
            let ball = snapshot
                .current_frame
                .as_ref()
                .and_then(|frame| {
                    frame
                        .entities
                        .iter()
                        .find(|entity| entity.entity_id == "ball-1")
                })
                .expect("ball frame exists");
            max_backward_jump = max_backward_jump.max(ball.position.x - previous_x);
            previous_x = ball.position.x;
        }

        assert!(
            max_backward_jump <= 1e-9,
            "ball should continue moving outward after leaving the board guide, got x jump {max_backward_jump}"
        );
    }
}
