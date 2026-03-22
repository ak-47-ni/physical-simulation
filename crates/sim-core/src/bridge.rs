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
