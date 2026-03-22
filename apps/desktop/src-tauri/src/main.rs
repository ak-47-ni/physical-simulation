use std::sync::Mutex;

use sim_core::bridge::{BridgeError, SimulationBridge};
use sim_core::runtime::RuntimeFramePayload;
use sim_core::scene::CompileSceneRequest;

const FIXED_STEP_SECONDS: f64 = 1.0 / 60.0;

struct RuntimeBridgeState(Mutex<SimulationBridge>);

impl Default for RuntimeBridgeState {
    fn default() -> Self {
        Self(Mutex::new(SimulationBridge::new(FIXED_STEP_SECONDS)))
    }
}

#[tauri::command]
fn compile_scene_command(
    state: tauri::State<'_, RuntimeBridgeState>,
    request: CompileSceneRequest,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, |bridge| bridge.compile_scene(request))
}

#[tauri::command]
fn start_runtime_command(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, SimulationBridge::start_or_resume)
}

#[tauri::command]
fn pause_runtime_command(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, SimulationBridge::pause)
}

#[tauri::command]
fn step_runtime_command(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, SimulationBridge::step)
}

#[tauri::command]
fn reset_runtime_command(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, SimulationBridge::reset)
}

#[tauri::command]
fn current_frame_command(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, |bridge| bridge.current_frame())
}

#[tauri::command]
fn mark_scene_dirty_command(state: tauri::State<'_, RuntimeBridgeState>) -> Result<(), String> {
    with_bridge(state, |bridge| {
        bridge.mark_dirty();
        Ok(())
    })
}

fn with_bridge<T>(
    state: tauri::State<'_, RuntimeBridgeState>,
    operation: impl FnOnce(&mut SimulationBridge) -> Result<T, BridgeError>,
) -> Result<T, String> {
    let mut bridge = state
        .0
        .lock()
        .map_err(|_| "runtime bridge state lock poisoned".to_string())?;

    operation(&mut bridge).map_err(format_bridge_error)
}

fn format_bridge_error(error: BridgeError) -> String {
    format!("{error:?}")
}

pub fn register_runtime_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(RuntimeBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            compile_scene_command,
            start_runtime_command,
            pause_runtime_command,
            step_runtime_command,
            reset_runtime_command,
            current_frame_command,
            mark_scene_dirty_command
        ])
}

fn main() {
    let _builder = register_runtime_commands(tauri::Builder::default());
}
