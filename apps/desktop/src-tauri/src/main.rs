use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use sim_core::analyzer::TrajectorySample;
use sim_core::bridge::{
    BridgeError, BridgeStatusSnapshot, DirtyEditScope, RuntimeCompileRequest, SimulationBridge,
};
use sim_core::entity::Vector2;
use sim_core::playback::PlaybackConfig;
use sim_core::runtime::RuntimeFramePayload;
use sim_core::scene::SceneCompileError;

const FIXED_STEP_SECONDS: f64 = 1.0 / 60.0;
#[cfg(not(test))]
const DEFAULT_RUNTIME_TRACE_PATH: &str = "/tmp/physics-sandbox-runtime-trace.jsonl";
const RUNTIME_TRACE_SCHEMA_VERSION: u32 = 1;

#[cfg(test)]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(test)]
static TEST_TRACE_COUNTER: AtomicU64 = AtomicU64::new(0);

struct RuntimeBridgeState(Mutex<SimulationBridge>);

impl Default for RuntimeBridgeState {
    fn default() -> Self {
        Self(Mutex::new(SimulationBridge::new(FIXED_STEP_SECONDS)))
    }
}

struct RuntimeTraceState {
    path: PathBuf,
    context: Mutex<RuntimeTraceContext>,
}

#[derive(Default)]
struct RuntimeTraceContext {
    run_id: u64,
    sequence: u64,
    ball_entity_ids: Vec<String>,
    previous_ball_frames: HashMap<String, PreviousBallFrame>,
}

#[derive(Clone, Copy)]
struct RuntimeTraceEventMarker {
    run_id: u64,
    sequence: u64,
}

#[derive(Clone, Copy)]
struct PreviousBallFrame {
    frame_number: u64,
    time_seconds: f64,
    position: Vector2,
}

impl Default for RuntimeTraceState {
    fn default() -> Self {
        Self {
            path: default_runtime_trace_path(),
            context: Mutex::new(RuntimeTraceContext::default()),
        }
    }
}

#[tauri::command]
fn compile_scene(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
    request: RuntimeCompileRequest,
) -> Result<BridgeStatusSnapshot, String> {
    record_compile_scene_trace(&trace_state, &request);
    let result = with_bridge(state, |bridge| {
        bridge.compile_runtime_request_snapshot(request)
    });
    record_snapshot_result_trace(&trace_state, "compile_scene", &result);
    result
}

#[tauri::command]
fn start_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, SimulationBridge::start_or_resume_snapshot);
    record_snapshot_result_trace(&trace_state, "start_runtime", &result);
    result
}

#[tauri::command]
fn pause_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, SimulationBridge::pause_snapshot);
    record_snapshot_result_trace(&trace_state, "pause_runtime", &result);
    result
}

#[tauri::command]
fn step_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, SimulationBridge::step_snapshot);
    record_snapshot_result_trace(&trace_state, "step_runtime", &result);
    result
}

#[tauri::command]
fn tick_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, SimulationBridge::tick_snapshot);
    record_snapshot_result_trace(&trace_state, "tick_runtime", &result);
    result
}

#[tauri::command]
fn reset_runtime(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, SimulationBridge::reset_snapshot);
    if result.is_ok() {
        start_new_trace_run(&trace_state);
    }
    record_snapshot_result_trace(&trace_state, "reset_runtime", &result);
    result
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
    trace_state: tauri::State<'_, RuntimeTraceState>,
    time_scale: f64,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, |bridge| bridge.set_time_scale(time_scale));
    record_snapshot_result_trace(&trace_state, "set_runtime_time_scale", &result);
    result
}

#[tauri::command]
fn set_runtime_playback_config(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
    config: PlaybackConfig,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, |bridge| bridge.set_playback_config_snapshot(config));
    record_snapshot_result_trace(&trace_state, "set_runtime_playback_config", &result);
    result
}

#[tauri::command]
fn seek_runtime_to_time(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
    time_seconds: f64,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, |bridge| bridge.seek_to_time_snapshot(time_seconds));
    record_snapshot_result_trace(&trace_state, "seek_runtime_to_time", &result);
    result
}

#[tauri::command]
fn runtime_status(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, |bridge| Ok(bridge.status_snapshot()));
    record_snapshot_result_trace(&trace_state, "runtime_status", &result);
    result
}

#[tauri::command]
fn mark_scene_dirty(
    state: tauri::State<'_, RuntimeBridgeState>,
    trace_state: tauri::State<'_, RuntimeTraceState>,
    scopes: Vec<DirtyEditScope>,
) -> Result<BridgeStatusSnapshot, String> {
    let result = with_bridge(state, |bridge| Ok(bridge.mark_dirty_scopes(&scopes)));
    record_snapshot_result_trace(&trace_state, "mark_scene_dirty", &result);
    result
}

#[tauri::command]
fn runtime_trace_path(trace_state: tauri::State<'_, RuntimeTraceState>) -> String {
    trace_state.path.display().to_string()
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

fn default_runtime_trace_path() -> PathBuf {
    #[cfg(test)]
    {
        let trace_id = TEST_TRACE_COUNTER.fetch_add(1, Ordering::Relaxed);
        return std::env::temp_dir().join(format!(
            "physics-sandbox-runtime-trace-test-{}-{trace_id}.jsonl",
            std::process::id()
        ));
    }

    #[cfg(not(test))]
    {
        PathBuf::from(DEFAULT_RUNTIME_TRACE_PATH)
    }
}

fn record_compile_scene_trace(trace_state: &RuntimeTraceState, request: &RuntimeCompileRequest) {
    let ball_entity_ids = request
        .scene
        .entities
        .iter()
        .filter(|entity| entity.kind == "ball")
        .map(|entity| entity.id.clone())
        .collect::<Vec<_>>();
    let sequence = reset_trace_context(trace_state, ball_entity_ids.clone());

    if let Err(error) = File::create(&trace_state.path) {
        eprintln!(
            "failed to reset runtime trace file {}: {error}",
            trace_state.path.display()
        );
        return;
    }

    append_runtime_trace_line(
        &trace_state.path,
        serde_json::json!({
            "event": "compile_scene",
            "traceVersion": RUNTIME_TRACE_SCHEMA_VERSION,
            "runId": sequence.run_id,
            "sequence": sequence.sequence,
            "timestampMs": unix_timestamp_millis(),
            "tracePath": trace_state.path.display().to_string(),
            "fixedStepSeconds": FIXED_STEP_SECONDS,
            "ballEntityIds": ball_entity_ids,
            "request": request,
        }),
    );
}

fn record_snapshot_result_trace(
    trace_state: &RuntimeTraceState,
    command: &str,
    result: &Result<BridgeStatusSnapshot, String>,
) {
    match result {
        Ok(snapshot) => record_snapshot_trace(trace_state, command, snapshot),
        Err(error) => record_command_error_trace(trace_state, command, error),
    }
}

fn record_snapshot_trace(
    trace_state: &RuntimeTraceState,
    command: &str,
    snapshot: &BridgeStatusSnapshot,
) {
    let Some(frame) = snapshot.current_frame.as_ref() else {
        let sequence = next_trace_sequence(trace_state);
        append_runtime_trace_line(
            &trace_state.path,
            serde_json::json!({
                "event": "command",
                "traceVersion": RUNTIME_TRACE_SCHEMA_VERSION,
                "runId": sequence.run_id,
                "sequence": sequence.sequence,
                "timestampMs": unix_timestamp_millis(),
                "command": command,
                "status": snapshot.status,
                "playbackMode": snapshot.playback_mode,
                "currentTimeSeconds": snapshot.current_time_seconds,
                "timeScale": snapshot.time_scale,
                "preparingProgress": snapshot.preparing_progress,
                "seekable": snapshot.seekable,
                "dirtyScopes": &snapshot.dirty_scopes,
                "rebuildRequired": snapshot.rebuild_required,
                "canResume": snapshot.can_resume,
                "blockReason": snapshot.block_reason,
            }),
        );
        return;
    };

    let (sequence, ball_world_positions, ball_frame_deltas) =
        trace_frame_state(trace_state, frame, snapshot.current_time_seconds);

    append_runtime_trace_line(
        &trace_state.path,
        serde_json::json!({
                "event": "frame",
                "traceVersion": RUNTIME_TRACE_SCHEMA_VERSION,
                "runId": sequence.run_id,
                "sequence": sequence.sequence,
                "timestampMs": unix_timestamp_millis(),
                "command": command,
                "status": snapshot.status,
            "playbackMode": snapshot.playback_mode,
            "currentTimeSeconds": snapshot.current_time_seconds,
            "timeScale": snapshot.time_scale,
            "frameNumber": frame.frame_number,
            "entities": &frame.entities,
            "ballWorldPositions": ball_world_positions,
            "ballFrameDeltas": ball_frame_deltas,
            "guideStates": &snapshot.guide_states,
            "preparingProgress": snapshot.preparing_progress,
            "seekable": snapshot.seekable,
            "dirtyScopes": &snapshot.dirty_scopes,
            "rebuildRequired": snapshot.rebuild_required,
            "canResume": snapshot.can_resume,
            "blockReason": snapshot.block_reason,
        }),
    );
}

fn record_command_error_trace(trace_state: &RuntimeTraceState, command: &str, error: &str) {
    let sequence = next_trace_sequence(trace_state);
    append_runtime_trace_line(
        &trace_state.path,
        serde_json::json!({
            "event": "command_error",
            "traceVersion": RUNTIME_TRACE_SCHEMA_VERSION,
            "runId": sequence.run_id,
            "sequence": sequence.sequence,
            "timestampMs": unix_timestamp_millis(),
            "command": command,
            "error": error,
        }),
    );
}

fn reset_trace_context(
    trace_state: &RuntimeTraceState,
    ball_entity_ids: Vec<String>,
) -> RuntimeTraceEventMarker {
    match trace_state.context.lock() {
        Ok(mut context) => {
            context.ball_entity_ids = ball_entity_ids;
            context.start_new_run()
        }
        Err(_) => {
            eprintln!("failed to lock runtime trace context for reset");
            RuntimeTraceEventMarker {
                run_id: 0,
                sequence: 0,
            }
        }
    }
}

fn start_new_trace_run(trace_state: &RuntimeTraceState) {
    match trace_state.context.lock() {
        Ok(mut context) => {
            context.start_new_run();
        }
        Err(_) => {
            eprintln!("failed to lock runtime trace context for new run");
        }
    }
}

fn next_trace_sequence(trace_state: &RuntimeTraceState) -> RuntimeTraceEventMarker {
    match trace_state.context.lock() {
        Ok(mut context) => context.next_sequence(),
        Err(_) => {
            eprintln!("failed to lock runtime trace context for sequence");
            RuntimeTraceEventMarker {
                run_id: 0,
                sequence: 0,
            }
        }
    }
}

fn trace_frame_state(
    trace_state: &RuntimeTraceState,
    frame: &RuntimeFramePayload,
    current_time_seconds: f64,
) -> (
    RuntimeTraceEventMarker,
    Vec<serde_json::Value>,
    Vec<serde_json::Value>,
) {
    match trace_state.context.lock() {
        Ok(mut context) => {
            let sequence = context.next_sequence();
            let ball_entity_ids = context.ball_entity_ids.clone();
            let mut ball_world_positions = Vec::new();
            let mut ball_frame_deltas = Vec::new();

            for entity in frame
                .entities
                .iter()
                .filter(|entity| should_trace_ball_entity(&entity.entity_id, &ball_entity_ids))
            {
                ball_world_positions.push(serde_json::json!({
                    "entityId": &entity.entity_id,
                    "frameNumber": frame.frame_number,
                    "timeSeconds": current_time_seconds,
                    "worldPosition": &entity.position,
                    "velocity": &entity.velocity,
                    "acceleration": &entity.acceleration,
                    "rotation": entity.rotation,
                }));

                if let Some(previous) = context.previous_ball_frames.get(&entity.entity_id) {
                    let dx = entity.position.x - previous.position.x;
                    let dy = entity.position.y - previous.position.y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    let delta_time_seconds = current_time_seconds - previous.time_seconds;

                    ball_frame_deltas.push(serde_json::json!({
                        "entityId": &entity.entity_id,
                        "fromFrameNumber": previous.frame_number,
                        "toFrameNumber": frame.frame_number,
                        "deltaTimeSeconds": delta_time_seconds,
                        "dx": dx,
                        "dy": dy,
                        "distance": distance,
                        "speedFromFrameDelta": if delta_time_seconds.abs() > f64::EPSILON {
                            Some(distance / delta_time_seconds.abs())
                        } else {
                            None
                        },
                    }));
                } else {
                    ball_frame_deltas.push(serde_json::json!({
                        "entityId": &entity.entity_id,
                        "fromFrameNumber": serde_json::Value::Null,
                        "toFrameNumber": frame.frame_number,
                        "deltaTimeSeconds": serde_json::Value::Null,
                        "dx": serde_json::Value::Null,
                        "dy": serde_json::Value::Null,
                        "distance": serde_json::Value::Null,
                        "speedFromFrameDelta": serde_json::Value::Null,
                    }));
                }

                context.previous_ball_frames.insert(
                    entity.entity_id.clone(),
                    PreviousBallFrame {
                        frame_number: frame.frame_number,
                        time_seconds: current_time_seconds,
                        position: entity.position,
                    },
                );
            }

            (sequence, ball_world_positions, ball_frame_deltas)
        }
        Err(_) => {
            eprintln!("failed to lock runtime trace context for frame");
            (
                RuntimeTraceEventMarker {
                    run_id: 0,
                    sequence: 0,
                },
                Vec::new(),
                Vec::new(),
            )
        }
    }
}

fn should_trace_ball_entity(entity_id: &str, ball_entity_ids: &[String]) -> bool {
    if ball_entity_ids.is_empty() {
        return entity_id.to_ascii_lowercase().contains("ball");
    }

    ball_entity_ids
        .iter()
        .any(|ball_entity_id| ball_entity_id == entity_id)
}

impl RuntimeTraceContext {
    fn start_new_run(&mut self) -> RuntimeTraceEventMarker {
        self.run_id += 1;
        self.sequence = 0;
        self.previous_ball_frames.clear();
        self.next_sequence()
    }

    fn next_sequence(&mut self) -> RuntimeTraceEventMarker {
        let sequence = self.sequence;
        self.sequence += 1;
        RuntimeTraceEventMarker {
            run_id: self.run_id,
            sequence,
        }
    }
}

fn append_runtime_trace_line(path: &Path, value: serde_json::Value) {
    let write_result = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| writeln!(file, "{value}"));

    if let Err(error) = write_result {
        eprintln!(
            "failed to append runtime trace file {}: {error}",
            path.display()
        );
    }
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
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
        BridgeError::EntityPayloadKindMismatch {
            id,
            expected_kind,
            actual_kind,
        } => format!(
            "invalid entity payload kind: {id} looks like {expected_kind} but is labeled {actual_kind}"
        ),
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
        } => {
            format!("invalid arc track radius: {constraint_id} must be positive (received {value})")
        }
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
        .manage(RuntimeTraceState::default())
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
            mark_scene_dirty,
            runtime_trace_path
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
    use std::{fs, path::PathBuf, time::Duration};

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
    fn compile_scene_writes_runtime_trace_with_configured_object_properties() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");
        let trace_path = runtime_trace_path_for_webview(&webview);
        let _ = fs::remove_file(&trace_path);

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

        let trace_events = read_trace_events(&trace_path);
        let compile_event = trace_events
            .iter()
            .find(|event| event["event"] == "compile_scene")
            .expect("compile scene trace event is written");

        assert_eq!(compile_event["ballEntityIds"], json!(["probe"]));
        assert_eq!(
            compile_event["request"]["scene"]["entities"][0]["id"],
            "probe"
        );
        assert_eq!(
            compile_event["request"]["scene"]["entities"][0]["velocityX"],
            1.5
        );
        assert_eq!(
            compile_event["request"]["scene"]["entities"][0]["velocityY"],
            0.0
        );
    }

    #[test]
    fn tick_runtime_appends_ball_world_position_and_frame_delta_to_runtime_trace() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");
        let trace_path = runtime_trace_path_for_webview(&webview);
        let _ = fs::remove_file(&trace_path);

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
        get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect("tick runtime command succeeds");

        let trace_events = read_trace_events(&trace_path);
        let tick_event = trace_events
            .iter()
            .find(|event| event["event"] == "frame" && event["command"] == "tick_runtime")
            .expect("tick runtime frame trace event is written");

        assert_eq!(tick_event["frameNumber"], 1);
        assert_eq!(
            tick_event["ballWorldPositions"][0]["entityId"],
            json!("probe")
        );
        assert!(
            tick_event["ballWorldPositions"][0]["worldPosition"]["x"]
                .as_f64()
                .expect("ball world x is numeric")
                .is_finite()
        );
        assert!(
            tick_event["ballFrameDeltas"][0]["distance"]
                .as_f64()
                .expect("ball frame delta distance is numeric")
                > 0.0
        );
    }

    #[test]
    fn reset_runtime_starts_new_trace_run_for_latest_position_analysis() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");
        let trace_path = runtime_trace_path_for_webview(&webview);
        let _ = fs::remove_file(&trace_path);

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
            .expect("first start runtime command succeeds");
        get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect("first tick runtime command succeeds");
        get_ipc_response(&webview, invoke_request("reset_runtime"))
            .expect("reset runtime command succeeds");
        get_ipc_response(&webview, invoke_request("start_runtime"))
            .expect("second start runtime command succeeds");
        get_ipc_response(&webview, invoke_request("tick_runtime"))
            .expect("second tick runtime command succeeds");

        let trace_events = read_trace_events(&trace_path);
        let first_tick_event = trace_events
            .iter()
            .find(|event| event["event"] == "frame" && event["command"] == "tick_runtime")
            .expect("first tick trace event is written");
        let reset_event = trace_events
            .iter()
            .find(|event| event["event"] == "frame" && event["command"] == "reset_runtime")
            .expect("reset trace event is written");
        let latest_tick_event = trace_events
            .iter()
            .rev()
            .find(|event| event["event"] == "frame" && event["command"] == "tick_runtime")
            .expect("latest tick trace event is written");

        let first_run_id = first_tick_event["runId"]
            .as_u64()
            .expect("first tick run id is numeric");
        let latest_run_id = latest_tick_event["runId"]
            .as_u64()
            .expect("latest tick run id is numeric");

        assert!(
            latest_run_id > first_run_id,
            "latest run id should advance after reset"
        );
        assert_eq!(reset_event["runId"], json!(latest_run_id));
        assert!(
            reset_event["ballFrameDeltas"][0]["distance"].is_null(),
            "reset frame should not compute a delta against a previous test run"
        );
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
    fn format_bridge_error_reports_arc_track_payload_kind_mismatches_without_ball_fallbacks() {
        let message = format_bridge_error(BridgeError::EntityPayloadKindMismatch {
            id: "arc-track-1".to_string(),
            expected_kind: "arc-track".to_string(),
            actual_kind: "ball".to_string(),
        });

        assert_eq!(
            message,
            "invalid entity payload kind: arc-track-1 looks like arc-track but is labeled ball"
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

    #[test]
    fn build_desktop_app_accepts_center_based_arc_track_compile_payloads() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");

        let response = get_ipc_response(
            &webview,
            invoke_request_with_body(
                "compile_scene",
                json!({
                    "request": {
                        "scene": {
                            "schemaVersion": 1,
                            "entities": [
                                {
                                    "id": "poly-1",
                                    "kind": "user-polygon",
                                    "points": [
                                        { "x": -1.0, "y": 0.0 },
                                        { "x": 1.0, "y": 0.0 },
                                        { "x": 1.0, "y": 2.0 },
                                        { "x": -1.0, "y": 2.0 }
                                    ]
                                },
                                {
                                    "id": "arc-track-1",
                                    "kind": "arc-track",
                                    "center": { "x": 0.0, "y": 2.0 },
                                    "radius": 3.0,
                                    "centralAngleDegrees": 135.0,
                                    "rotationDegrees": 180.0,
                                    "thickness": 0.14
                                }
                            ],
                            "constraints": [],
                            "forceSources": [
                                {
                                    "id": "gravity-1",
                                    "kind": "gravity",
                                    "acceleration": { "x": 0.0, "y": -9.81 }
                                }
                            ],
                            "analyzers": [],
                            "annotations": []
                        },
                        "dirtyScopes": [],
                        "rebuildRequired": false
                    }
                }),
            ),
        )
        .expect("center-based arc-track payload should compile");

        let snapshot = response
            .deserialize::<BridgeStatusSnapshot>()
            .expect("compile snapshot deserializes");

        assert_eq!(snapshot.status, BridgeStatus::Idle);
        assert_eq!(
            snapshot
                .current_frame
                .as_ref()
                .map(|frame| frame.frame_number),
            Some(0)
        );
        assert_eq!(
            snapshot
                .current_frame
                .as_ref()
                .map(|frame| frame.entities.len()),
            Some(1)
        );
    }

    fn invoke_request(command: &str) -> InvokeRequest {
        invoke_request_with_body(command, serde_json::Value::Object(Default::default()))
    }

    fn runtime_trace_path_for_webview(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    ) -> PathBuf {
        let response = get_ipc_response(webview, invoke_request("runtime_trace_path"))
            .expect("runtime trace path command succeeds");
        let path = response
            .deserialize::<String>()
            .expect("runtime trace path deserializes");

        PathBuf::from(path)
    }

    fn read_trace_events(trace_path: &PathBuf) -> Vec<serde_json::Value> {
        fs::read_to_string(trace_path)
            .expect("trace file exists")
            .lines()
            .map(|line| serde_json::from_str(line).expect("trace line is valid json"))
            .collect()
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
