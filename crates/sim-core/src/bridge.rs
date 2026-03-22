use serde::{Deserialize, Serialize};

use crate::analyzer::TrajectorySample;
use crate::entity::{EntityDefinition, ShapeDefinition, Vector2};
use crate::force::ForceSourceDefinition;
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use crate::scene::{compile_scene, CompileSceneRequest, CompiledScene, SceneCompileError};

#[derive(Debug, Clone, PartialEq)]
pub enum BridgeError {
    DirtySceneRequiresRebuild,
    InvalidTimeScale {
        value: f64,
    },
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
    compiled_scene: Option<CompiledScene>,
    runtime: Option<RuntimeScene>,
    dirty_scopes: Vec<DirtyEditScope>,
    status: BridgeStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeStatus {
    Idle,
    Running,
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
    pub can_resume: bool,
    pub block_reason: Option<BridgeBlockReason>,
}

impl SimulationBridge {
    pub fn new(fixed_delta_seconds: f64) -> Self {
        Self {
            base_delta_seconds: fixed_delta_seconds.max(f64::EPSILON),
            time_scale: 1.0,
            compiled_scene: None,
            runtime: None,
            dirty_scopes: Vec::new(),
            status: BridgeStatus::Idle,
        }
    }

    pub fn compile_scene(
        &mut self,
        request: CompileSceneRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        let compiled_scene = compile_scene(&request).map_err(BridgeError::SceneCompile)?;
        let runtime = RuntimeScene::new(compiled_scene.clone(), self.step_delta_seconds());
        let frame = runtime.current_frame();

        self.compiled_scene = Some(compiled_scene);
        self.runtime = Some(runtime);
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

    pub fn start_or_resume(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.guard_runtime_ready()?;
        self.status = BridgeStatus::Running;
        self.current_frame()
    }

    pub fn pause(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.ensure_runtime_initialized()?;
        self.status = BridgeStatus::Paused;
        self.current_frame()
    }

    pub fn step(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.guard_runtime_ready()?;

        let runtime = self
            .runtime
            .as_mut()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        Ok(runtime.step())
    }

    pub fn reset(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        let compiled_scene = self
            .compiled_scene
            .clone()
            .ok_or(BridgeError::RuntimeNotInitialized)?;
        self.time_scale = 1.0;
        let runtime = RuntimeScene::new(compiled_scene, self.step_delta_seconds());
        let frame = runtime.current_frame();

        self.runtime = Some(runtime);
        self.dirty_scopes.clear();
        self.status = BridgeStatus::Idle;

        Ok(frame)
    }

    pub fn current_frame(&self) -> Result<RuntimeFramePayload, BridgeError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        Ok(runtime.current_frame())
    }

    pub fn analyzer_samples(&self, id: &str) -> Result<Vec<TrajectorySample>, BridgeError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        runtime
            .analyzer_samples(id)
            .map(|samples| samples.to_vec())
            .ok_or_else(|| BridgeError::UnknownAnalyzer { id: id.to_string() })
    }

    pub fn set_time_scale(&mut self, time_scale: f64) -> Result<BridgeStatusSnapshot, BridgeError> {
        if !time_scale.is_finite() || time_scale <= 0.0 {
            return Err(BridgeError::InvalidTimeScale { value: time_scale });
        }

        self.time_scale = time_scale;

        let step_delta_seconds = self.step_delta_seconds();
        if let Some(runtime) = self.runtime.as_mut() {
            runtime.set_fixed_delta_seconds(step_delta_seconds);
        }

        Ok(self.status_snapshot())
    }

    pub fn mark_dirty(&mut self) {
        self.mark_dirty_scopes(&[DirtyEditScope::Structure]);
    }

    pub fn mark_dirty_scopes(&mut self, scopes: &[DirtyEditScope]) {
        for scope in scopes {
            if !self.dirty_scopes.contains(scope) {
                self.dirty_scopes.push(*scope);
            }
        }

        self.status = if self.runtime.is_some() {
            BridgeStatus::Paused
        } else {
            BridgeStatus::Idle
        };
    }

    pub fn is_dirty(&self) -> bool {
        self.rebuild_required()
    }

    pub fn is_running(&self) -> bool {
        self.status == BridgeStatus::Running
    }

    pub fn status_snapshot(&self) -> BridgeStatusSnapshot {
        let current_time_seconds = self
            .runtime
            .as_ref()
            .map(RuntimeScene::elapsed_time_seconds)
            .unwrap_or(0.0);
        let current_frame = self.runtime.as_ref().map(RuntimeScene::current_frame);

        BridgeStatusSnapshot {
            status: self.status,
            current_frame,
            current_time_seconds,
            time_scale: self.time_scale,
            can_resume: !self.rebuild_required(),
            block_reason: if self.rebuild_required() {
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

    fn step_delta_seconds(&self) -> f64 {
        (self.base_delta_seconds * self.time_scale).max(f64::EPSILON)
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
        reject_unsupported_records("constraints", &self.scene.constraints)?;
        reject_unsupported_records("forceSources", &self.scene.force_sources)?;
        reject_unsupported_records("analyzers", &self.scene.analyzers)?;

        Ok(CompileSceneRequest {
            entities: self
                .scene
                .entities
                .into_iter()
                .map(SceneEntityPayload::into_entity_definition)
                .collect(),
            constraints: vec![],
            force_sources: vec![ForceSourceDefinition::Gravity {
                id: "gravity-earth".to_string(),
                acceleration: Vector2::new(0.0, -9.81),
            }],
            analyzers: vec![],
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
    pub constraints: Vec<SceneKindRecord>,
    pub force_sources: Vec<SceneKindRecord>,
    pub analyzers: Vec<SceneKindRecord>,
    pub annotations: Vec<AnnotationStrokePayload>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneEntityPayload {
    pub id: String,
    pub kind: String,
    pub points: Vec<Vector2>,
}

impl SceneEntityPayload {
    fn into_entity_definition(self) -> EntityDefinition {
        let centroid = polygon_centroid(&self.points);
        let local_points = self
            .points
            .into_iter()
            .map(|point| point.sub(centroid))
            .collect::<Vec<_>>();

        EntityDefinition {
            id: self.id,
            shape: ShapeDefinition::ConvexPolygon {
                points: local_points,
            },
            position: centroid,
            rotation_radians: 0.0,
            initial_velocity: Vector2::ZERO,
            mass: 0.0,
            is_static: true,
            friction_coefficient: 0.6,
            restitution_coefficient: 0.0,
        }
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
pub struct AnnotationStrokePayload {
    pub id: String,
    pub points: Vec<Vector2>,
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

fn reject_unsupported_records(
    section: &str,
    records: &[SceneKindRecord],
) -> Result<(), BridgeError> {
    if let Some(record) = records.first() {
        return Err(BridgeError::UnsupportedSceneRecord {
            section: section.to_string(),
            record: record.clone(),
        });
    }

    Ok(())
}
