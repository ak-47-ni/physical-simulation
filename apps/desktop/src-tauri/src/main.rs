use std::sync::Mutex;

use sim_core::analyzer::TrajectorySample;
use sim_core::bridge::{
    AnnotationStrokePayload, BridgeError, BridgeStatusSnapshot, DirtyEditScope,
    RuntimeCompileRequest, SceneAnalyzerRecord, SceneDocumentPayload, SceneEntityPayload,
    SceneKindRecord, SimulationBridge,
};
use sim_core::runtime::RuntimeFramePayload;

const FIXED_STEP_SECONDS: f64 = 1.0 / 60.0;

struct RuntimeBridgeState(Mutex<SimulationBridge>);

impl Default for RuntimeBridgeState {
    fn default() -> Self {
        Self(Mutex::new(SimulationBridge::new(FIXED_STEP_SECONDS)))
    }
}

fn compile_scene_frame_command(
    bridge: &mut SimulationBridge,
    request: RuntimeCompileRequest,
) -> Result<RuntimeFramePayload, BridgeError> {
    bridge.compile_runtime_request(request)
}

fn compile_scene_snapshot_command(
    bridge: &mut SimulationBridge,
    request: RuntimeCompileRequest,
) -> Result<BridgeStatusSnapshot, BridgeError> {
    bridge.compile_runtime_request_snapshot(request)
}

fn start_runtime_frame_command(
    bridge: &mut SimulationBridge,
) -> Result<RuntimeFramePayload, BridgeError> {
    bridge.start_or_resume()
}

fn start_runtime_snapshot_command(
    bridge: &mut SimulationBridge,
) -> Result<BridgeStatusSnapshot, BridgeError> {
    bridge.start_or_resume_snapshot()
}

fn pause_runtime_frame_command(
    bridge: &mut SimulationBridge,
) -> Result<RuntimeFramePayload, BridgeError> {
    bridge.pause()
}

fn pause_runtime_snapshot_command(
    bridge: &mut SimulationBridge,
) -> Result<BridgeStatusSnapshot, BridgeError> {
    bridge.pause_snapshot()
}

fn step_runtime_frame_command(
    bridge: &mut SimulationBridge,
) -> Result<RuntimeFramePayload, BridgeError> {
    bridge.step()
}

fn step_runtime_snapshot_command(
    bridge: &mut SimulationBridge,
) -> Result<BridgeStatusSnapshot, BridgeError> {
    bridge.step_snapshot()
}

fn reset_runtime_frame_command(
    bridge: &mut SimulationBridge,
) -> Result<RuntimeFramePayload, BridgeError> {
    bridge.reset()
}

fn reset_runtime_snapshot_command(
    bridge: &mut SimulationBridge,
) -> Result<BridgeStatusSnapshot, BridgeError> {
    bridge.reset_snapshot()
}

#[tauri::command]
fn compile_scene(
    state: tauri::State<'_, RuntimeBridgeState>,
    request: RuntimeCompileRequest,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, |bridge| compile_scene_frame_command(bridge, request))
}

#[tauri::command]
fn compile_scene_snapshot(
    state: tauri::State<'_, RuntimeBridgeState>,
    request: RuntimeCompileRequest,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| compile_scene_snapshot_command(bridge, request))
}

#[tauri::command]
fn start_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, start_runtime_frame_command)
}

#[tauri::command]
fn start_runtime_snapshot(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, start_runtime_snapshot_command)
}

#[tauri::command]
fn pause_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, pause_runtime_frame_command)
}

#[tauri::command]
fn pause_runtime_snapshot(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, pause_runtime_snapshot_command)
}

#[tauri::command]
fn step_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, step_runtime_frame_command)
}

#[tauri::command]
fn step_runtime_snapshot(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, step_runtime_snapshot_command)
}

#[tauri::command]
fn reset_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, reset_runtime_frame_command)
}

#[tauri::command]
fn reset_runtime_snapshot(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, reset_runtime_snapshot_command)
}

#[tauri::command]
fn current_frame(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<RuntimeFramePayload, String> {
    with_bridge(state, |bridge| bridge.current_frame())
}

#[tauri::command]
fn analyzer_samples(
    state: tauri::State<'_, RuntimeBridgeState>,
    analyzer_id: String,
) -> Result<Vec<TrajectorySample>, String> {
    with_bridge(state, |bridge| bridge.analyzer_samples(&analyzer_id))
}

#[tauri::command]
fn read_trajectory_samples(
    state: tauri::State<'_, RuntimeBridgeState>,
    analyzer_id: String,
) -> Result<Vec<TrajectorySample>, String> {
    with_bridge(state, |bridge| bridge.read_trajectory_samples(&analyzer_id))
}

#[tauri::command]
fn set_runtime_time_scale(
    state: tauri::State<'_, RuntimeBridgeState>,
    time_scale: f64,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| bridge.set_time_scale(time_scale))
}

#[tauri::command]
fn runtime_status(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| Ok(bridge.status_snapshot()))
}

#[tauri::command]
fn mark_scene_dirty(
    state: tauri::State<'_, RuntimeBridgeState>,
    scopes: Vec<DirtyEditScope>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| Ok(bridge.mark_dirty_scopes(&scopes)))
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
    match error {
        BridgeError::DirtySceneRequiresRebuild => "runtime resume requires rebuild".to_string(),
        BridgeError::IncompleteAnalyzerRecord {
            id,
            kind,
            missing_field,
        } => {
            format!("incomplete analyzer record: {id} ({kind}) is missing {missing_field}")
        }
        BridgeError::IncompleteEntityRecord {
            id,
            kind,
            missing_field,
        } => {
            format!("incomplete entity record: {id} ({kind}) is missing {missing_field}")
        }
        BridgeError::InvalidTimeScale { value } => format!("invalid time scale: {value}"),
        BridgeError::RuntimeNotInitialized => "runtime not initialized".to_string(),
        BridgeError::UnknownAnalyzer { id } => format!("unknown analyzer: {id}"),
        BridgeError::UnsupportedSceneRecord { section, record } => {
            format!(
                "unsupported runtime compile {section} record: {} ({})",
                record.id, record.kind
            )
        }
        BridgeError::SceneCompile(source) => format!("scene compile error: {source:?}"),
    }
}

pub fn register_runtime_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(RuntimeBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            compile_scene,
            compile_scene_snapshot,
            start_runtime,
            start_runtime_snapshot,
            pause_runtime,
            pause_runtime_snapshot,
            step_runtime,
            step_runtime_snapshot,
            reset_runtime,
            reset_runtime_snapshot,
            current_frame,
            analyzer_samples,
            read_trajectory_samples,
            set_runtime_time_scale,
            runtime_status,
            mark_scene_dirty
        ])
}

fn main() {
    let _builder = register_runtime_commands(tauri::Builder::default());
}

#[cfg(test)]
mod tests {
    use super::*;
    use sim_core::bridge::BridgeStatus;

    fn runtime_compile_request() -> RuntimeCompileRequest {
        RuntimeCompileRequest {
            scene: SceneDocumentPayload {
                schema_version: 1,
                entities: vec![SceneEntityPayload {
                    id: "ball-1".to_string(),
                    kind: "ball".to_string(),
                    points: None,
                    x: Some(132.0),
                    y: Some(176.0),
                    width: None,
                    height: None,
                    radius: Some(24.0),
                    mass: None,
                    friction: None,
                    restitution: None,
                    locked: None,
                    velocity_x: Some(12.0),
                    velocity_y: Some(-6.0),
                }],
                constraints: Vec::<SceneKindRecord>::new(),
                force_sources: Vec::<SceneKindRecord>::new(),
                analyzers: Vec::<SceneAnalyzerRecord>::new(),
                annotations: Vec::<AnnotationStrokePayload>::new(),
            },
            dirty_scopes: vec![DirtyEditScope::Analysis],
            rebuild_required: false,
        }
    }

    #[test]
    fn command_helpers_preserve_frame_commands_for_runtime_controls() {
        let mut bridge = SimulationBridge::new(FIXED_STEP_SECONDS);

        let compile_frame = compile_scene_frame_command(&mut bridge, runtime_compile_request())
            .expect("compile frame command should succeed");
        assert_eq!(compile_frame.frame_number, 0);

        let start_frame =
            start_runtime_frame_command(&mut bridge).expect("start frame command should succeed");
        assert_eq!(start_frame.frame_number, 0);

        let stepped_frame =
            step_runtime_frame_command(&mut bridge).expect("step frame command should succeed");
        assert_eq!(stepped_frame.frame_number, 1);

        let paused_frame =
            pause_runtime_frame_command(&mut bridge).expect("pause frame command should succeed");
        assert_eq!(paused_frame.frame_number, 1);

        let reset_frame =
            reset_runtime_frame_command(&mut bridge).expect("reset frame command should succeed");
        assert_eq!(reset_frame.frame_number, 0);
    }

    #[test]
    fn command_helpers_expose_snapshot_variants_for_runtime_controls() {
        let mut bridge = SimulationBridge::new(FIXED_STEP_SECONDS);

        let compiled = compile_scene_snapshot_command(&mut bridge, runtime_compile_request())
            .expect("compile snapshot command should succeed");
        assert_eq!(compiled.status, BridgeStatus::Idle);
        assert_eq!(compiled.current_frame.as_ref().map(|frame| frame.frame_number), Some(0));

        let running = start_runtime_snapshot_command(&mut bridge)
            .expect("start snapshot command should succeed");
        assert_eq!(running.status, BridgeStatus::Running);

        let stepped =
            step_runtime_snapshot_command(&mut bridge).expect("step snapshot command should succeed");
        assert_eq!(stepped.status, BridgeStatus::Running);
        assert_eq!(stepped.current_frame.as_ref().map(|frame| frame.frame_number), Some(1));

        let paused = pause_runtime_snapshot_command(&mut bridge)
            .expect("pause snapshot command should succeed");
        assert_eq!(paused.status, BridgeStatus::Paused);

        let reset = reset_runtime_snapshot_command(&mut bridge)
            .expect("reset snapshot command should succeed");
        assert_eq!(reset.status, BridgeStatus::Idle);
        assert_eq!(reset.current_frame.as_ref().map(|frame| frame.frame_number), Some(0));
    }
}
