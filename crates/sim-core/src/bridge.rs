use serde::{Deserialize, Serialize};

use crate::analyzer::{AnalyzerDefinition, TrajectorySample};
use crate::entity::{EntityDefinition, ShapeDefinition, Vector2};
use crate::force::ForceSourceDefinition;
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use crate::scene::{compile_scene, CompileSceneRequest, CompiledScene, SceneCompileError};

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
        let rebuild_required = self.rebuild_required();
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
            constraints: vec![],
            force_sources: vec![ForceSourceDefinition::Gravity {
                id: "gravity-earth".to_string(),
                acceleration: Vector2::new(0.0, -9.81),
            }],
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
    pub constraints: Vec<SceneKindRecord>,
    pub force_sources: Vec<SceneKindRecord>,
    pub analyzers: Vec<SceneAnalyzerRecord>,
    pub annotations: Vec<AnnotationStrokePayload>,
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
            rotation_radians: 0.0,
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
            restitution: 0.0,
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
