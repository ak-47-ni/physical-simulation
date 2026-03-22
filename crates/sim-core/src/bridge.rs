use serde::{Deserialize, Serialize};

use crate::entity::{EntityDefinition, ShapeDefinition, Vector2};
use crate::force::ForceSourceDefinition;
use crate::runtime::{RuntimeFramePayload, RuntimeScene};
use crate::scene::{CompileSceneRequest, CompiledScene, SceneCompileError, compile_scene};

#[derive(Debug, Clone, PartialEq)]
pub enum BridgeError {
    DirtySceneRequiresRebuild,
    RuntimeNotInitialized,
    SceneCompile(SceneCompileError),
}

#[derive(Debug, Clone)]
pub struct SimulationBridge {
    fixed_delta_seconds: f64,
    compiled_scene: Option<CompiledScene>,
    runtime: Option<RuntimeScene>,
    dirty: bool,
    running: bool,
}

impl SimulationBridge {
    pub fn new(fixed_delta_seconds: f64) -> Self {
        Self {
            fixed_delta_seconds: fixed_delta_seconds.max(f64::EPSILON),
            compiled_scene: None,
            runtime: None,
            dirty: false,
            running: false,
        }
    }

    pub fn compile_scene(
        &mut self,
        request: CompileSceneRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        let compiled_scene = compile_scene(&request).map_err(BridgeError::SceneCompile)?;
        let runtime = RuntimeScene::new(compiled_scene.clone(), self.fixed_delta_seconds);
        let frame = runtime.current_frame();

        self.compiled_scene = Some(compiled_scene);
        self.runtime = Some(runtime);
        self.dirty = false;
        self.running = false;

        Ok(frame)
    }

    pub fn compile_runtime_request(
        &mut self,
        request: RuntimeCompileRequest,
    ) -> Result<RuntimeFramePayload, BridgeError> {
        self.compile_scene(request.into_compile_scene_request())
    }

    pub fn start_or_resume(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.guard_runtime_ready()?;
        self.running = true;
        self.current_frame()
    }

    pub fn pause(&mut self) -> Result<RuntimeFramePayload, BridgeError> {
        self.ensure_runtime_initialized()?;
        self.running = false;
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
        let runtime = RuntimeScene::new(compiled_scene, self.fixed_delta_seconds);
        let frame = runtime.current_frame();

        self.runtime = Some(runtime);
        self.dirty = false;
        self.running = false;

        Ok(frame)
    }

    pub fn current_frame(&self) -> Result<RuntimeFramePayload, BridgeError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(BridgeError::RuntimeNotInitialized)?;

        Ok(runtime.current_frame())
    }

    pub fn mark_dirty(&mut self) {
        self.dirty = true;
        self.running = false;
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn is_running(&self) -> bool {
        self.running
    }

    fn guard_runtime_ready(&self) -> Result<(), BridgeError> {
        if self.dirty {
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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeCompileRequest {
    pub scene: SceneDocumentPayload,
    pub dirty_scopes: Vec<DirtyEditScope>,
    pub rebuild_required: bool,
}

impl RuntimeCompileRequest {
    pub fn into_compile_scene_request(self) -> CompileSceneRequest {
        CompileSceneRequest {
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
        }
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
