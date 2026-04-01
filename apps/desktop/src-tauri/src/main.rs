use std::sync::Mutex;

use sim_core::analyzer::TrajectorySample;
use sim_core::bridge::{
    BridgeError, BridgeStatusSnapshot, DirtyEditScope, RuntimeCompileRequest, SimulationBridge,
};
use sim_core::playback::PlaybackConfig;
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
    with_bridge(state, |bridge| {
        bridge.compile_runtime_request_snapshot(request)
    })
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
fn tick_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, SimulationBridge::tick_snapshot)
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
fn set_runtime_playback_config(
    state: tauri::State<'_, RuntimeBridgeState>,
    config: PlaybackConfig,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| bridge.set_playback_config_snapshot(config))
}

#[tauri::command]
fn seek_runtime_to_time(
    state: tauri::State<'_, RuntimeBridgeState>,
    time_seconds: f64,
) -> Result<BridgeStatusSnapshot, String> {
    with_bridge(state, |bridge| bridge.seek_to_time_snapshot(time_seconds))
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
        BridgeError::InvalidPlaybackConfig { field, value } => {
            format!("invalid playback config: {field} must be positive (received {value})")
        }
        BridgeError::InvalidSeekTime { value } => format!("invalid seek time: {value}"),
        BridgeError::PlaybackCacheNotReady => "cached playback is not ready".to_string(),
        BridgeError::PlaybackConfigLockedWhileActive => {
            "runtime playback config is locked while playback is active".to_string()
        }
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
        } => {
            format!("invalid spring stiffness: {constraint_id} must be positive (received {value})")
        }
        SceneCompileError::InvalidShapeParameters { entity_id, kind } => {
            format!("invalid shape parameters: {entity_id} ({kind})")
        }
        SceneCompileError::InvalidTrackAxis { constraint_id } => {
            format!("invalid track axis: {constraint_id} must use a non-zero axis")
        }
        SceneCompileError::InvalidArcTrackRadius {
            constraint_id,
            value,
        } => format!(
            "invalid arc track radius: {constraint_id} must be positive (received {value})"
        ),
        SceneCompileError::InvalidArcTrackSpan {
            constraint_id,
            start_angle_degrees,
            end_angle_degrees,
        } => format!(
            "invalid arc track span: {constraint_id} must define a non-zero partial sweep (received {start_angle_degrees}deg -> {end_angle_degrees}deg)"
        ),
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
            tick_runtime,
            reset_runtime,
            current_frame,
            analyzer_samples,
            read_trajectory_samples,
            set_runtime_time_scale,
            set_runtime_playback_config,
            seek_runtime_to_time,
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

    use serde_json::json;
    use sim_core::bridge::BridgeStatus;
    use sim_core::playback::PlaybackMode;
    use sim_core::scene::SceneCompileError;
    use tauri::Manager;
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;

    use super::{
        BridgeError, BridgeStatusSnapshot, build_desktop_app, format_bridge_error, run_desktop_app,
    };

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
    fn build_desktop_app_registers_runtime_tick_command() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");

        let error = get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect_err("tick runtime should be registered and return an init error");

        assert_eq!(error.as_str(), Some("runtime not initialized"));
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

        assert_eq!(
            message,
            "invalid track axis: track-1 must use a non-zero axis"
        );
    }

    #[test]
    fn format_bridge_error_reports_arc_track_validation_without_debug_dump() {
        let radius_message = format_bridge_error(BridgeError::SceneCompile(
            SceneCompileError::InvalidArcTrackRadius {
                constraint_id: "arc-track-1".to_string(),
                value: 0.0,
            },
        ));
        let span_message = format_bridge_error(BridgeError::SceneCompile(
            SceneCompileError::InvalidArcTrackSpan {
                constraint_id: "arc-track-1".to_string(),
                start_angle_degrees: 45.0,
                end_angle_degrees: 45.0,
            },
        ));

        assert_eq!(
            radius_message,
            "invalid arc track radius: arc-track-1 must be positive (received 0)"
        );
        assert_eq!(
            span_message,
            "invalid arc track span: arc-track-1 must define a non-zero partial sweep (received 45deg -> 45deg)"
        );
    }

    #[test]
    fn format_bridge_error_keeps_unknown_analyzer_messages_stable() {
        let message = format_bridge_error(BridgeError::UnknownAnalyzer {
            id: "traj-missing".to_string(),
        });

        assert_eq!(message, "unknown analyzer: traj-missing");
    }

    #[test]
    fn build_desktop_app_registers_playback_config_and_seek_commands() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");

        let config_response = get_ipc_response(
            &webview,
            invoke_request_with_body(
                "set_runtime_playback_config",
                json!({
                    "config": {
                        "mode": "precomputed",
                        "realtimeDurationSeconds": 40.0,
                        "precomputeDurationSeconds": 2.0
                    }
                }),
            ),
        )
        .expect("playback config command succeeds");
        let config_snapshot = config_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("playback config snapshot deserializes");

        assert_eq!(config_snapshot.playback_mode, PlaybackMode::Precomputed);
        assert_eq!(config_snapshot.total_duration_seconds, 2.0);
        assert!(!config_snapshot.seekable);

        let compile_response = get_ipc_response(
            &webview,
            invoke_request_with_body(
                "compile_scene",
                json!({
                    "request": runtime_compile_request_body(),
                }),
            ),
        )
        .expect("compile scene command succeeds");
        let compile_snapshot = compile_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("compile snapshot deserializes");
        assert_eq!(compile_snapshot.status, BridgeStatus::Idle);

        let preparing_response = get_ipc_response(&webview, invoke_request("start_runtime"))
            .expect("start runtime command succeeds");
        let preparing_snapshot = preparing_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("preparing snapshot deserializes");
        assert_eq!(preparing_snapshot.status, BridgeStatus::Preparing);
        assert_eq!(preparing_snapshot.preparing_progress, Some(0.0));

        let progress_response = get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect("precompute progress tick succeeds");
        let progress_snapshot = progress_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("progress snapshot deserializes");
        assert_eq!(progress_snapshot.status, BridgeStatus::Preparing);
        assert_eq!(progress_snapshot.preparing_progress, Some(0.5));

        let ready_response = get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect("precompute completion tick succeeds");
        let ready_snapshot = ready_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("ready snapshot deserializes");
        assert_eq!(ready_snapshot.status, BridgeStatus::Running);
        assert!(ready_snapshot.seekable);

        let seek_response = get_ipc_response(
            &webview,
            invoke_request_with_body("seek_runtime_to_time", json!({ "timeSeconds": 0.149 })),
        )
        .expect("seek runtime command succeeds");
        let seek_snapshot = seek_response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("seek snapshot deserializes");

        assert_eq!(seek_snapshot.status, BridgeStatus::Paused);
        assert_eq!(
            seek_snapshot
                .current_frame
                .as_ref()
                .map(|frame| frame.frame_number),
            Some(9)
        );
        assert!((seek_snapshot.current_time_seconds - 0.15).abs() < 1e-9);
    }

    #[test]
    fn build_desktop_app_keeps_new_transport_errors_teacher_readable() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");

        let seek_error = get_ipc_response(
            &webview,
            invoke_request_with_body("seek_runtime_to_time", json!({ "timeSeconds": 1.0 })),
        )
        .expect_err("seek should fail before cached playback exists");
        assert_eq!(seek_error.as_str(), Some("cached playback is not ready"));

        get_ipc_response(
            &webview,
            invoke_request_with_body(
                "compile_scene",
                json!({
                    "request": runtime_compile_request_body(),
                }),
            ),
        )
        .expect("compile scene command succeeds");
        get_ipc_response(&webview, invoke_request("start_runtime"))
            .expect("start runtime command succeeds");

        let config_error = get_ipc_response(
            &webview,
            invoke_request_with_body(
                "set_runtime_playback_config",
                json!({
                    "config": {
                        "mode": "precomputed",
                        "realtimeDurationSeconds": 40.0,
                        "precomputeDurationSeconds": 2.0
                    }
                }),
            ),
        )
        .expect_err("changing playback config while active should be blocked");
        assert_eq!(
            config_error.as_str(),
            Some("runtime playback config is locked while playback is active")
        );
    }

    fn invoke_request(command: &str) -> InvokeRequest {
        invoke_request_with_body(command, serde_json::Value::Object(Default::default()))
    }

    fn invoke_request_with_body(command: &str, body: serde_json::Value) -> InvokeRequest {
        InvokeRequest {
            cmd: command.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "http://tauri.localhost".parse().expect("valid invoke url"),
            body: tauri::ipc::InvokeBody::from(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        }
    }

    fn runtime_compile_request_body() -> serde_json::Value {
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "probe",
                        "kind": "ball",
                        "x": 0.0,
                        "y": 3.0,
                        "radius": 1.0,
                        "mass": 1.0,
                        "friction": 0.2,
                        "restitution": 0.1,
                        "velocityX": 1.5,
                        "velocityY": 0.0
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-earth",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": -9.81 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        })
    }
}
