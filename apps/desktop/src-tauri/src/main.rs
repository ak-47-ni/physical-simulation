use std::sync::Mutex;

use sim_core::analyzer::TrajectorySample;
use sim_core::bridge::{
    BridgeError, BridgeStatusSnapshot, DirtyEditScope, RuntimeCompileRequest, SimulationBridge,
};
use sim_core::scene::SceneCompileError;

const FIXED_STEP_SECONDS: f64 = 1.0 / 60.0;

struct RuntimeBridgeState(Mutex<SimulationBridge>);

impl Default for RuntimeBridgeState {
    fn default() -> Self {
        Self(Mutex::new(SimulationBridge::new(FIXED_STEP_SECONDS)))
    }
}

#[tauri::command]
fn compile_scene(
    state: tauri::State<'_, RuntimeBridgeState>,
    request: RuntimeCompileRequest,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| bridge.compile_runtime_request_snapshot(request))
}

#[tauri::command]
fn start_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, SimulationBridge::start_or_resume_snapshot)
}

#[tauri::command]
fn pause_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, SimulationBridge::pause_snapshot)
}

#[tauri::command]
fn step_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, SimulationBridge::step_snapshot)
}

#[tauri::command]
fn reset_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, SimulationBridge::reset_snapshot)
}

#[tauri::command]
fn current_frame(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<sim_core::runtime::RuntimeFramePayload, String> {
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
        BridgeError::SceneCompile(source) => format_scene_compile_error(source),
    }
}

fn format_scene_compile_error(error: SceneCompileError) -> String {
    match error {
        SceneCompileError::DuplicateEntityId { id } => format!("duplicate entity id: {id}"),
        SceneCompileError::InvalidSpringRestLength {
            constraint_id,
            value,
        } => format!(
            "invalid spring rest length: {constraint_id} must be positive (received {value})"
        ),
        SceneCompileError::InvalidSpringStiffness {
            constraint_id,
            value,
        } => format!(
            "invalid spring stiffness: {constraint_id} must be positive (received {value})"
        ),
        SceneCompileError::InvalidShapeParameters { entity_id, kind } => {
            format!("invalid shape parameters: {entity_id} ({kind})")
        }
        SceneCompileError::InvalidTrackAxis { constraint_id } => {
            format!("invalid track axis: {constraint_id} must use a non-zero axis")
        }
        SceneCompileError::MissingGravity => {
            "missing gravity force source in runtime compile request".to_string()
        }
        SceneCompileError::NonConvexPolygon { entity_id } => {
            format!("non-convex polygon is not supported: {entity_id}")
        }
        SceneCompileError::UnknownConstraintEntity {
            constraint_id,
            entity_id,
        } => format!("unknown constraint entity: {constraint_id} references {entity_id}"),
        SceneCompileError::UnknownAnalyzerEntity {
            analyzer_id,
            entity_id,
        } => format!("unknown analyzer entity: {analyzer_id} references {entity_id}"),
        SceneCompileError::UnsupportedShape { entity_id, kind } => {
            format!("unsupported shape: {entity_id} ({kind})")
        }
    }
}

pub fn register_runtime_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(RuntimeBridgeState::default())
        .invoke_handler(tauri::generate_handler![
            compile_scene,
            start_runtime,
            pause_runtime,
            step_runtime,
            reset_runtime,
            current_frame,
            analyzer_samples,
            read_trajectory_samples,
            set_runtime_time_scale,
            runtime_status,
            mark_scene_dirty
        ])
}

pub fn build_desktop_app<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    context: tauri::Context<R>,
) -> tauri::Result<tauri::App<R>> {
    register_runtime_commands(builder).build(context)
}

pub fn run_desktop_app<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    context: tauri::Context<R>,
) -> tauri::Result<()> {
    register_runtime_commands(builder).run(context)
}

fn main() {
    run_desktop_app(tauri::Builder::default(), tauri::generate_context!())
        .expect("failed to run tauri desktop shell");
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use sim_core::bridge::BridgeStatus;
    use sim_core::scene::SceneCompileError;
    use tauri::Manager;
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;

    use super::{BridgeError, BridgeStatusSnapshot, build_desktop_app, format_bridge_error, run_desktop_app};

    #[test]
    fn build_desktop_app_registers_runtime_status_command() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");

        let response = get_ipc_response(&webview, invoke_request("runtime_status"))
            .expect("runtime status command succeeds");
        let snapshot = response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("status snapshot deserializes");

        assert_eq!(snapshot.status, BridgeStatus::Idle);
        assert!(snapshot.can_resume);
        assert!(!snapshot.rebuild_required);
        assert!(snapshot.current_frame.is_none());
    }

    #[test]
    fn run_desktop_app_executes_the_builder_run_path() {
        let builder = mock_builder().setup(|app: &mut tauri::App<tauri::test::MockRuntime>| {
            tauri::WebviewWindowBuilder::new(app, "main", Default::default())
                .build()
                .expect("webview builds in setup");

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(10));
                handle
                    .get_webview_window("main")
                    .expect("main window exists")
                    .close()
                    .expect("main window closes");
            });

            Ok(())
        });

        run_desktop_app(builder, mock_context(noop_assets())).expect("app runs");
    }

    #[test]
    fn format_bridge_error_reports_constraint_validation_without_debug_dump() {
        let message = format_bridge_error(BridgeError::SceneCompile(
            SceneCompileError::InvalidTrackAxis {
                constraint_id: "track-1".to_string(),
            },
        ));

        assert_eq!(message, "invalid track axis: track-1 must use a non-zero axis");
    }

    #[test]
    fn format_bridge_error_keeps_unknown_analyzer_messages_stable() {
        let message = format_bridge_error(BridgeError::UnknownAnalyzer {
            id: "traj-missing".to_string(),
        });

        assert_eq!(message, "unknown analyzer: traj-missing");
    }

    fn invoke_request(command: &str) -> InvokeRequest {
        InvokeRequest {
            cmd: command.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "http://tauri.localhost".parse().expect("valid invoke url"),
            body: tauri::ipc::InvokeBody::default(),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        }
    }
}
