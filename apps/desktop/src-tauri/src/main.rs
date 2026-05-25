use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
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
const DEFAULT_OPENAI_MODEL: &str = "gpt-5.5";
const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_OPENAI_TEMPERATURE: f64 = 0.0;
const SCENE_DRAFT_SCHEMA_VERSION: u32 = 1;
const SCENE_DRAFT_PROMPT_VERSION: u32 = 1;

#[derive(Clone, Debug)]
struct SceneGenerationConfig {
    base_url: String,
    model: String,
    prompt_version: u32,
    schema_version: u32,
    temperature: f64,
}

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

#[tauri::command]
fn write_export_text_file(path: String, contents: String) -> Result<String, String> {
    let path = PathBuf::from(path);

    write_export_text_contents(&path, &contents)?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn generate_scene_draft(prompt: String) -> Result<String, String> {
    generate_scene_draft_with_env(prompt).await
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

fn write_export_text_contents(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| format!("failed to export file: {error}"))
}

async fn generate_scene_draft_with_env(prompt: String) -> Result<String, String> {
    let local_env = read_desktop_env_file();
    let api_key = read_desktop_config_value("OPENAI_API_KEY", &local_env)
        .map_err(|_| "OPENAI_API_KEY is not configured.".to_string())?;
    let model = read_desktop_config_value("OPENAI_MODEL", &local_env)
        .unwrap_or_else(|_| DEFAULT_OPENAI_MODEL.to_string());
    let base_url = read_desktop_config_value("OPENAI_BASE_URL", &local_env)
        .unwrap_or_else(|_| DEFAULT_OPENAI_BASE_URL.to_string());
    let temperature = parse_openai_temperature(
        read_desktop_config_value("OPENAI_TEMPERATURE", &local_env)
            .ok()
            .as_deref(),
    )?;
    let config = build_scene_generation_config(model, base_url, temperature);
    let cache_dir = read_openai_scene_cache_dir(
        read_desktop_config_value("OPENAI_SCENE_CACHE_DIR", &local_env)
            .ok()
            .as_deref(),
    );

    request_openai_scene_draft(&api_key, &config, cache_dir.as_deref(), &prompt).await
}

fn read_desktop_config_value(
    key: &str,
    local_env: &HashMap<String, String>,
) -> Result<String, std::env::VarError> {
    match std::env::var(key) {
        Ok(value) => Ok(value),
        Err(std::env::VarError::NotPresent) => local_env
            .get(key)
            .cloned()
            .ok_or(std::env::VarError::NotPresent),
        Err(error) => Err(error),
    }
}

fn read_desktop_env_file() -> HashMap<String, String> {
    let mut values = HashMap::new();
    let Ok(contents) = fs::read_to_string(".desktop.env") else {
        return values;
    };

    for line in contents.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = key.trim();

        if key.is_empty() {
            continue;
        }

        values.insert(key.to_string(), trim_env_value(value));
    }

    values
}

fn trim_env_value(value: &str) -> String {
    let trimmed = value.trim();

    if trimmed.len() >= 2 {
        let first = trimmed.as_bytes()[0];
        let last = trimmed.as_bytes()[trimmed.len() - 1];

        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }

    trimmed.to_string()
}

fn parse_openai_temperature(value: Option<&str>) -> Result<f64, String> {
    let Some(raw_value) = value else {
        return Ok(DEFAULT_OPENAI_TEMPERATURE);
    };
    let trimmed = raw_value.trim();

    if trimmed.is_empty() {
        return Ok(DEFAULT_OPENAI_TEMPERATURE);
    }

    let temperature = trimmed
        .parse::<f64>()
        .map_err(|_| "OPENAI_TEMPERATURE must be a number between 0 and 2.".to_string())?;

    if !(0.0..=2.0).contains(&temperature) {
        return Err("OPENAI_TEMPERATURE must be between 0 and 2.".to_string());
    }

    Ok(temperature)
}

fn read_openai_scene_cache_dir(value: Option<&str>) -> Option<PathBuf> {
    value
        .map(str::trim)
        .filter(|trimmed| !trimmed.is_empty())
        .map(PathBuf::from)
}

fn build_scene_generation_config(
    model: String,
    base_url: String,
    temperature: f64,
) -> SceneGenerationConfig {
    SceneGenerationConfig {
        base_url,
        model,
        prompt_version: SCENE_DRAFT_PROMPT_VERSION,
        schema_version: SCENE_DRAFT_SCHEMA_VERSION,
        temperature,
    }
}

fn build_scene_generation_cache_key(config: &SceneGenerationConfig, prompt: &str) -> String {
    let config_fingerprint = stable_fnv1a64_hex(&format!(
        "base_url={}\nmodel={}\ntemperature={:.6}\nschema_version={}\nprompt_version={}",
        config.base_url.trim(),
        config.model.trim(),
        config.temperature,
        config.schema_version,
        config.prompt_version
    ));
    let prompt_fingerprint = stable_fnv1a64_hex(prompt.trim());

    format!(
        "scene-draft-v{}-prompt-v{}-{config_fingerprint}-{prompt_fingerprint}.json",
        config.schema_version, config.prompt_version
    )
}

fn stable_fnv1a64_hex(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;

    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    format!("{hash:016x}")
}

fn read_scene_generation_cache_entry(
    cache_dir: &Path,
    cache_key: &str,
) -> Result<Option<String>, String> {
    let cache_path = scene_generation_cache_entry_path(cache_dir, cache_key)?;

    match fs::read_to_string(cache_path) {
        Ok(contents) if is_valid_scene_generation_cache_entry(&contents) => Ok(Some(contents)),
        Ok(_) => Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed to read scene generation cache: {error}")),
    }
}

fn is_valid_scene_generation_cache_entry(contents: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(contents)
        .ok()
        .and_then(|value| {
            value
                .get("schemaVersion")
                .and_then(serde_json::Value::as_u64)
        })
        == Some(u64::from(SCENE_DRAFT_SCHEMA_VERSION))
}

fn write_scene_generation_cache_entry(
    cache_dir: &Path,
    cache_key: &str,
    contents: &str,
) -> Result<(), String> {
    if !is_valid_scene_generation_cache_entry(contents) {
        return Ok(());
    }

    let cache_path = scene_generation_cache_entry_path(cache_dir, cache_key)?;

    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("failed to create scene generation cache directory: {error}"))?;
    fs::write(cache_path, contents)
        .map_err(|error| format!("failed to write scene generation cache: {error}"))
}

fn scene_generation_cache_entry_path(cache_dir: &Path, cache_key: &str) -> Result<PathBuf, String> {
    if cache_key.is_empty()
        || cache_key.contains('/')
        || cache_key.contains('\\')
        || cache_key.contains("..")
        || !cache_key.ends_with(".json")
    {
        return Err("invalid scene generation cache key.".to_string());
    }

    Ok(cache_dir.join(cache_key))
}

async fn request_openai_scene_draft(
    api_key: &str,
    config: &SceneGenerationConfig,
    cache_dir: Option<&Path>,
    prompt: &str,
) -> Result<String, String> {
    if prompt.trim().is_empty() {
        return Err("Prompt is empty.".to_string());
    }

    let cache_key = build_scene_generation_cache_key(config, prompt);

    if let Some(cache_dir) = cache_dir {
        if let Some(cached_draft) = read_scene_generation_cache_entry(cache_dir, &cache_key)? {
            return Ok(cached_draft);
        }
    }

    let generated_draft = request_openai_scene_draft_uncached(api_key, config, prompt).await?;

    if let Some(cache_dir) = cache_dir {
        write_scene_generation_cache_entry(cache_dir, &cache_key, &generated_draft)?;
    }

    Ok(generated_draft)
}

async fn request_openai_scene_draft_uncached(
    api_key: &str,
    config: &SceneGenerationConfig,
    prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = resolve_openai_responses_url(&config.base_url)?;
    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&build_openai_scene_draft_request(
            &config.model,
            config.temperature,
            prompt,
        ))
        .send()
        .await
        .map_err(|error| format!("failed to call OpenAI: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read OpenAI response: {error}"))?;

    if !status.is_success() {
        if should_retry_openai_scene_draft_without_schema(status) {
            return request_openai_scene_draft_without_schema(
                &client, api_key, config, &url, prompt, status, &body,
            )
            .await;
        }

        return Err(format!("OpenAI scene generation failed ({status}): {body}"));
    }

    extract_openai_response_text(&body)
}

async fn request_openai_scene_draft_without_schema(
    client: &reqwest::Client,
    api_key: &str,
    config: &SceneGenerationConfig,
    url: &str,
    prompt: &str,
    original_status: reqwest::StatusCode,
    original_body: &str,
) -> Result<String, String> {
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&build_openai_scene_draft_fallback_request(
            &config.model,
            config.temperature,
            prompt,
        ))
        .send()
        .await
        .map_err(|error| {
            format!(
                "OpenAI scene generation failed ({original_status}): {original_body}; fallback request failed: {error}"
            )
        })?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read OpenAI fallback response: {error}"))?;

    if !status.is_success() {
        return Err(format!(
            "OpenAI scene generation failed ({original_status}): {original_body}; fallback failed ({status}): {body}"
        ));
    }

    extract_openai_response_text(&body)
}

fn should_retry_openai_scene_draft_without_schema(status: reqwest::StatusCode) -> bool {
    status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS
}

fn fixed_scene_generation_baseline_prompts() -> &'static [&'static str] {
    &[
        "生成一个小球自由落体实验场景",
        "生成一个斜面上木块下滑的实验场景",
        "生成两个小球发生弹性碰撞的场景",
        "生成一个弹簧连接小车的简谐运动场景",
    ]
}

fn build_real_provider_baseline_artifact_record(
    prompt: &str,
    config: &SceneGenerationConfig,
    result: Result<String, String>,
) -> serde_json::Value {
    match result {
        Ok(draft_text) => match serde_json::from_str::<serde_json::Value>(&draft_text) {
            Ok(draft) => serde_json::json!({
                "baseUrlHost": read_base_url_host(&config.base_url),
                "firstDraft": draft,
                "error": null,
                "model": config.model,
                "ok": true,
                "prompt": prompt,
                "promptVersion": config.prompt_version,
                "schemaVersion": config.schema_version,
                "temperature": config.temperature
            }),
            Err(error) => serde_json::json!({
                "baseUrlHost": read_base_url_host(&config.base_url),
                "firstDraft": null,
                "error": format!("provider returned non-JSON draft: {error}"),
                "model": config.model,
                "ok": false,
                "prompt": prompt,
                "promptVersion": config.prompt_version,
                "schemaVersion": config.schema_version,
                "temperature": config.temperature
            }),
        },
        Err(error) => serde_json::json!({
            "baseUrlHost": read_base_url_host(&config.base_url),
            "firstDraft": null,
            "error": sanitize_provider_error(&error),
            "model": config.model,
            "ok": false,
            "prompt": prompt,
            "promptVersion": config.prompt_version,
            "schemaVersion": config.schema_version,
            "temperature": config.temperature
        }),
    }
}

fn read_base_url_host(base_url: &str) -> String {
    reqwest::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "invalid-url".to_string())
}

fn sanitize_provider_error(error: &str) -> String {
    error
        .split_whitespace()
        .map(|part| {
            if part.starts_with("sk-") {
                "[REDACTED]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn resolve_openai_responses_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');

    if trimmed.is_empty() {
        return Err("OPENAI_BASE_URL is empty.".to_string());
    }

    if trimmed.ends_with("/responses") {
        return Ok(trimmed.to_string());
    }

    if trimmed.ends_with("/v1") {
        return Ok(format!("{trimmed}/responses"));
    }

    if base_url_has_no_path(trimmed) {
        return Ok(format!("{trimmed}/v1/responses"));
    }

    Ok(format!("{trimmed}/responses"))
}

fn base_url_has_no_path(trimmed_url: &str) -> bool {
    let Some((_, rest)) = trimmed_url.split_once("://") else {
        return !trimmed_url.contains('/');
    };

    !rest.contains('/')
}

fn build_openai_scene_draft_request(
    model: &str,
    temperature: f64,
    prompt: &str,
) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "temperature": temperature,
        "instructions": build_scene_draft_system_prompt(),
        "input": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "physics_scene_draft",
                "strict": true,
                "schema": scene_draft_json_schema()
            }
        }
    })
}

fn build_openai_scene_draft_fallback_request(
    model: &str,
    temperature: f64,
    prompt: &str,
) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "temperature": temperature,
        "instructions": format!(
            "{} Return exactly one valid JSON object. Do not include markdown fences, comments, prose, or trailing text. The object must contain schemaVersion: {}, title, locale, domain, gravity, entities, relationships, analyzers, assumptions, warnings, and unsupported. Use null for unknown optional fields.",
            build_scene_draft_system_prompt(),
            SCENE_DRAFT_SCHEMA_VERSION
        ),
        "input": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    })
}

fn build_scene_draft_system_prompt() -> &'static str {
    "You convert Chinese high-school mechanics exam prompts into a JSON SceneDraft for a classroom physics sandbox. Return only data matching the schema. Build a general scene model, not a solved answer. Use SI units in meters, kilograms, seconds, newtons. Supported entities are balls, blocks, boards, and arc-track circular rails. Use board.angleDegrees for inclined or horizontal rails; positive angles slope downward to the right in the canvas. If a prompt mentions ground, floor, 地面, 水平地面, or 水平面, represent it as an explicit locked horizontal board entity and reference that entity from place-on relationships; never reference an undeclared ground entity. Use board.height only for physical board thickness; never put an exam vertical drop h or altitude into board.height. If a prompt gives vertical height h on an incline with sin(theta), choose a board length at least h/sin(theta), keep board.height null or about 0.14, and place the released body near the high/start end. Use arc-track for every smooth circular arc, set radius, sweepAngleDegrees, angleDegrees as the arc mid-angle, friction 0 for smooth rails, and connect it with connect-endpoints relationships. Use connect-endpoints to express a continuous track chain such as incline -> arc -> horizontal track. Use place-on for a body initially on a board or track support. If a compressed tiny spring only releases stored energy, makes two bodies instantly separate, and is not attached after release, use energy-release with totalKineticEnergy and direction instead of creating any spring constraint. In energy-release, direction is entityA's release direction; entityB moves oppositely by momentum conservation. If a fixed spring with a free contact end is described, create a small locked block named as the fixed anchor and use contact-spring-end with anchor, target, gap, restLength, and stiffness. The gap is the initial distance between the moving target and the free spring end; restLength is the uncompressed spring length from fixed anchor to free end. If the prompt says x0, gap, 相距, 间距, or 自由端, do not connect the moving target directly with spring-between; use contact-spring-end instead. Use spring-between only for springs already attached to two bodies from the start. Smooth/light/massless rails or springs should be represented with zero friction and assumptions or warnings, not unsupported. Elastic head-on collisions should use restitution 1 on the colliding bodies. Put genuinely unsupported behavior in warnings while still building the closest usable scene."
}

fn scene_draft_json_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "required": [
            "schemaVersion",
            "title",
            "locale",
            "domain",
            "gravity",
            "entities",
            "relationships",
            "analyzers",
            "assumptions",
            "warnings",
            "unsupported"
        ],
        "properties": {
            "schemaVersion": { "const": SCENE_DRAFT_SCHEMA_VERSION },
            "title": { "type": "string" },
            "locale": { "type": "string", "enum": ["zh-CN"] },
            "domain": { "type": "string", "enum": ["mechanics"] },
            "gravity": { "type": ["number", "null"] },
            "entities": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "kind",
                        "name",
                        "mass",
                        "friction",
                        "restitution",
                        "locked",
                        "initialVelocity",
                        "length",
                        "width",
                        "height",
                        "radius",
                        "angleDegrees",
                        "center",
                        "sweepAngleDegrees",
                        "thickness",
                        "anchorEntity",
                        "anchorEndpoint",
                        "entryEndpoint",
                        "side"
                    ],
                    "properties": {
                        "kind": { "type": "string", "enum": ["arc-track", "ball", "block", "board"] },
                        "name": { "type": "string" },
                        "mass": { "type": ["number", "null"] },
                        "friction": { "type": ["number", "null"] },
                        "restitution": { "type": ["number", "null"] },
                        "locked": { "type": ["boolean", "null"] },
                        "initialVelocity": {
                            "type": ["object", "null"],
                            "additionalProperties": false,
                            "required": ["x", "y"],
                            "properties": {
                                "x": { "type": "number" },
                                "y": { "type": "number" }
                            }
                        },
                        "length": { "type": ["number", "null"] },
                        "width": { "type": ["number", "null"] },
                        "height": { "type": ["number", "null"] },
                        "radius": { "type": ["number", "null"] },
                        "angleDegrees": { "type": ["number", "null"] },
                        "center": {
                            "type": ["object", "null"],
                            "additionalProperties": false,
                            "required": ["x", "y"],
                            "properties": {
                                "x": { "type": "number" },
                                "y": { "type": "number" }
                            }
                        },
                        "sweepAngleDegrees": { "type": ["number", "null"] },
                        "thickness": { "type": ["number", "null"] },
                        "anchorEntity": { "type": ["string", "null"] },
                        "anchorEndpoint": { "type": ["string", "null"], "enum": ["start", "end", null] },
                        "entryEndpoint": { "type": ["string", "null"], "enum": ["start", "end", null] },
                        "side": { "type": ["string", "null"], "enum": ["inside", "outside", null] }
                    }
                }
            },
            "relationships": {
                "type": "array",
                "items": {
                    "anyOf": [
                        {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind", "entity", "target", "position"],
                            "properties": {
                                "kind": { "type": "string", "enum": ["place-on"] },
                                "entity": { "type": "string" },
                                "target": { "type": "string" },
                                "position": { "type": ["string", "null"], "enum": ["left", "center", "right", null] }
                            }
                        },
                        {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind", "entityA", "entityB", "restLength", "stiffness"],
                            "properties": {
                                "kind": { "type": "string", "enum": ["spring-between"] },
                                "entityA": { "type": "string" },
                                "entityB": { "type": "string" },
                                "restLength": { "type": ["number", "null"] },
                                "stiffness": { "type": ["number", "null"] }
                            }
                        },
                        {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind", "anchor", "target", "gap", "restLength", "stiffness"],
                            "properties": {
                                "kind": { "type": "string", "enum": ["contact-spring-end"] },
                                "anchor": { "type": "string" },
                                "target": { "type": "string" },
                                "gap": { "type": ["number", "null"] },
                                "restLength": { "type": ["number", "null"] },
                                "stiffness": { "type": ["number", "null"] }
                            }
                        },
                        {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind", "entityA", "entityB", "totalKineticEnergy", "direction"],
                            "properties": {
                                "kind": { "type": "string", "enum": ["energy-release"] },
                                "entityA": { "type": "string" },
                                "entityB": { "type": "string" },
                                "totalKineticEnergy": { "type": "number" },
                                "direction": {
                                    "type": ["object", "null"],
                                    "additionalProperties": false,
                                    "required": ["x", "y"],
                                    "properties": {
                                        "x": { "type": "number" },
                                        "y": { "type": "number" }
                                    }
                                }
                            }
                        },
                        {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind", "source", "sourceEndpoint", "target", "targetEndpoint"],
                            "properties": {
                                "kind": { "type": "string", "enum": ["connect-endpoints"] },
                                "source": { "type": "string" },
                                "sourceEndpoint": { "type": "string", "enum": ["start", "end"] },
                                "target": { "type": "string" },
                                "targetEndpoint": { "type": "string", "enum": ["start", "end"] }
                            }
                        }
                    ]
                }
            },
            "analyzers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["kind", "entity"],
                    "properties": {
                        "kind": { "type": "string", "enum": ["trajectory"] },
                        "entity": { "type": "string" }
                    }
                }
            },
            "assumptions": { "type": "array", "items": { "type": "string" } },
            "warnings": { "type": "array", "items": { "type": "string" } },
            "unsupported": { "type": "array", "items": { "type": "string" } }
        }
    })
}

fn extract_openai_response_text(body: &str) -> Result<String, String> {
    let trimmed = body.trim();

    if trimmed.is_empty() {
        return Err("OpenAI response body was empty.".to_string());
    }

    if trimmed.lines().any(|line| {
        let line = line.trim_start();

        line.starts_with("data:") || line.starts_with("event:")
    }) {
        return extract_openai_sse_response_text(trimmed);
    }

    let value = serde_json::from_str::<serde_json::Value>(trimmed)
        .map_err(|error| format!("failed to parse OpenAI response JSON: {error}"))?;

    if looks_like_scene_draft_json(&value) {
        return Ok(trimmed.to_string());
    }

    let text = extract_openai_response_text_value(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;

    normalize_openai_generated_scene_text(&text)
}

fn extract_openai_response_text_value(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.get("output_text").and_then(serde_json::Value::as_str) {
        return Some(text.to_string());
    }

    if let Some(text) = value
        .get("choices")
        .and_then(serde_json::Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(serde_json::Value::as_str)
    {
        return Some(text.to_string());
    }

    let output = value.get("output").and_then(serde_json::Value::as_array)?;

    for item in output {
        let Some(content) = item.get("content").and_then(serde_json::Value::as_array) else {
            continue;
        };

        for content_item in content {
            if let Some(text) = content_item.get("text").and_then(serde_json::Value::as_str) {
                return Some(text.to_string());
            }
        }
    }

    None
}

fn extract_openai_sse_response_text(body: &str) -> Result<String, String> {
    let mut text_delta = String::new();
    let mut final_text: Option<String> = None;

    for line in body.lines() {
        let trimmed = line.trim();

        if !trimmed.starts_with("data:") {
            continue;
        }

        let data = trimmed.trim_start_matches("data:").trim();

        if data.is_empty() || data == "[DONE]" {
            continue;
        }

        let value = serde_json::from_str::<serde_json::Value>(data)
            .map_err(|error| format!("failed to parse OpenAI streaming response JSON: {error}"))?;

        if let Some(delta) = value.get("delta").and_then(serde_json::Value::as_str) {
            text_delta.push_str(delta);
            continue;
        }

        if let Some(delta) = value
            .get("choices")
            .and_then(serde_json::Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| delta.get("content"))
            .and_then(serde_json::Value::as_str)
        {
            text_delta.push_str(delta);
            continue;
        }

        if let Some(text) = extract_openai_response_text_value(&value) {
            final_text = Some(text);
            continue;
        }

        if let Some(text) = value
            .get("response")
            .and_then(extract_openai_response_text_value)
        {
            final_text = Some(text);
        }
    }

    if !text_delta.is_empty() {
        return normalize_openai_generated_scene_text(&text_delta);
    }

    let text = final_text
        .ok_or_else(|| "OpenAI streaming response did not include generated text.".to_string())?;

    normalize_openai_generated_scene_text(&text)
}

fn looks_like_scene_draft_json(value: &serde_json::Value) -> bool {
    value.get("domain").and_then(serde_json::Value::as_str) == Some("mechanics")
        && value
            .get("entities")
            .and_then(serde_json::Value::as_array)
            .is_some()
        && value
            .get("relationships")
            .and_then(serde_json::Value::as_array)
            .is_some()
}

fn normalize_openai_generated_scene_text(text: &str) -> Result<String, String> {
    let candidate = strip_json_code_fence(text.trim()).trim().to_string();

    if candidate.is_empty() {
        return Err("OpenAI generated text was empty.".to_string());
    }

    let value = serde_json::from_str::<serde_json::Value>(&candidate)
        .map_err(|error| format!("OpenAI generated text was not valid SceneDraft JSON: {error}"))?;

    if !looks_like_scene_draft_json(&value) {
        return Err("OpenAI generated JSON did not match SceneDraft shape.".to_string());
    }

    Ok(candidate)
}

fn strip_json_code_fence(text: &str) -> &str {
    let Some(without_opening) = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```JSON"))
        .or_else(|| text.strip_prefix("```"))
    else {
        return text;
    };

    without_opening
        .strip_suffix("```")
        .unwrap_or(without_opening)
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
        .plugin(tauri_plugin_dialog::init())
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
            runtime_trace_path,
            write_export_text_file,
            generate_scene_draft
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
    use std::{collections::HashMap, fs, path::PathBuf, time::Duration};

    use serde_json::json;
    use sim_core::bridge::BridgeStatus;
    use sim_core::playback::PlaybackMode;
    use sim_core::scene::SceneCompileError;
    use tauri::Manager;
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;

    use super::{
        BridgeError, BridgeStatusSnapshot, build_desktop_app, format_bridge_error,
        read_desktop_config_value, resolve_openai_responses_url, run_desktop_app, trim_env_value,
        write_export_text_contents,
    };

    #[test]
    fn resolve_openai_responses_url_accepts_base_or_full_responses_url() {
        assert_eq!(
            resolve_openai_responses_url("https://api.openai.com/v1").as_deref(),
            Ok("https://api.openai.com/v1/responses")
        );
        assert_eq!(
            resolve_openai_responses_url("https://gateway.example.com").as_deref(),
            Ok("https://gateway.example.com/v1/responses")
        );
        assert_eq!(
            resolve_openai_responses_url("https://gateway.example.com/v1/responses").as_deref(),
            Ok("https://gateway.example.com/v1/responses")
        );
        assert!(resolve_openai_responses_url("   ").is_err());
    }

    #[test]
    fn build_openai_scene_draft_request_uses_top_level_instructions_and_message_input() {
        let request = super::build_openai_scene_draft_request("gpt-test", 0.0, "测试题目");

        assert_eq!(request["model"], json!("gpt-test"));
        assert_eq!(request["temperature"], json!(0.0));
        assert_eq!(
            request["instructions"],
            json!(super::build_scene_draft_system_prompt())
        );
        assert_eq!(
            request["input"],
            json!([
                {
                    "role": "user",
                    "content": "测试题目"
                }
            ])
        );
    }

    #[test]
    fn build_openai_scene_draft_fallback_request_omits_strict_schema_format() {
        let request = super::build_openai_scene_draft_fallback_request("gpt-test", 0.0, "测试题目");

        assert_eq!(request["model"], json!("gpt-test"));
        assert_eq!(request["temperature"], json!(0.0));
        assert!(request.get("text").is_none());
        assert!(
            request["instructions"]
                .as_str()
                .expect("instructions are text")
                .contains("Return exactly one valid JSON object")
        );
        assert!(
            request["instructions"]
                .as_str()
                .expect("instructions are text")
                .contains("schemaVersion")
        );
        assert_eq!(
            request["input"],
            json!([
                {
                    "role": "user",
                    "content": "测试题目"
                }
            ])
        );
    }

    #[test]
    fn scene_draft_prompt_requires_explicit_ground_board_entities() {
        let prompt = super::build_scene_draft_system_prompt();

        assert!(prompt.contains("represent it as an explicit locked horizontal board entity"));
        assert!(prompt.contains("never reference an undeclared ground entity"));
    }

    #[test]
    fn read_openai_temperature_defaults_to_zero_and_rejects_invalid_values() {
        assert_eq!(super::parse_openai_temperature(None).unwrap(), 0.0);
        assert_eq!(super::parse_openai_temperature(Some("0.2")).unwrap(), 0.2);
        assert!(super::parse_openai_temperature(Some("-0.1")).is_err());
        assert!(super::parse_openai_temperature(Some("not-a-number")).is_err());
    }

    #[test]
    fn read_openai_scene_cache_dir_ignores_missing_or_blank_values() {
        assert_eq!(super::read_openai_scene_cache_dir(None), None);
        assert_eq!(super::read_openai_scene_cache_dir(Some("   ")), None);
        assert_eq!(
            super::read_openai_scene_cache_dir(Some(" /tmp/physics-cache ")),
            Some(PathBuf::from("/tmp/physics-cache"))
        );
    }

    #[test]
    fn real_provider_baseline_artifact_metadata_uses_safe_host_and_fixed_prompts() {
        let prompts = super::fixed_scene_generation_baseline_prompts();
        let config = super::SceneGenerationConfig {
            base_url: "https://api.openai.example/v1".to_string(),
            model: "gpt-test".to_string(),
            prompt_version: 1,
            schema_version: 1,
            temperature: 0.0,
        };
        let record = super::build_real_provider_baseline_artifact_record(
            prompts[0],
            &config,
            Ok("{\"schemaVersion\":1}".to_string()),
        );

        assert_eq!(prompts.len(), 4);
        assert_eq!(prompts[0], "生成一个小球自由落体实验场景");
        assert_eq!(record["baseUrlHost"], json!("api.openai.example"));
        assert_eq!(record["model"], json!("gpt-test"));
        assert_eq!(record["ok"], json!(true));
        assert_eq!(record["firstDraft"], json!({"schemaVersion": 1}));
        assert!(record.get("apiKey").is_none());
    }

    #[test]
    #[ignore = "requires PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 and a configured OPENAI_API_KEY"]
    fn openai_real_provider_fixed_prompts_write_draft_artifact() {
        if std::env::var("PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE").as_deref() != Ok("1") {
            panic!("set PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 to run this real-provider test");
        }

        let output_path = std::env::var("PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH")
            .expect("set PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH to write the artifact");
        let local_env = super::read_desktop_env_file();
        let api_key = super::read_desktop_config_value("OPENAI_API_KEY", &local_env)
            .expect("OPENAI_API_KEY is not configured");
        let model = super::read_desktop_config_value("OPENAI_MODEL", &local_env)
            .unwrap_or_else(|_| super::DEFAULT_OPENAI_MODEL.to_string());
        let base_url = super::read_desktop_config_value("OPENAI_BASE_URL", &local_env)
            .unwrap_or_else(|_| super::DEFAULT_OPENAI_BASE_URL.to_string());
        let temperature = super::parse_openai_temperature(
            super::read_desktop_config_value("OPENAI_TEMPERATURE", &local_env)
                .ok()
                .as_deref(),
        )
        .expect("OPENAI_TEMPERATURE must be valid");
        let cache_dir = super::read_openai_scene_cache_dir(
            super::read_desktop_config_value("OPENAI_SCENE_CACHE_DIR", &local_env)
                .ok()
                .as_deref(),
        );
        let config = super::build_scene_generation_config(model, base_url, temperature);
        let repeat = std::env::var("PHYSICS_SANDBOX_REAL_PROVIDER_REPEAT").as_deref() == Ok("1");
        let records = super::fixed_scene_generation_baseline_prompts()
            .iter()
            .map(|prompt| {
                let first_result =
                    tauri::async_runtime::block_on(super::request_openai_scene_draft(
                        &api_key,
                        &config,
                        cache_dir.as_deref(),
                        prompt,
                    ));
                let mut record = super::build_real_provider_baseline_artifact_record(
                    prompt,
                    &config,
                    first_result,
                );

                if repeat {
                    let second_result =
                        tauri::async_runtime::block_on(super::request_openai_scene_draft(
                            &api_key,
                            &config,
                            cache_dir.as_deref(),
                            prompt,
                        ));
                    let second_record = super::build_real_provider_baseline_artifact_record(
                        prompt,
                        &config,
                        second_result,
                    );

                    if let Some(record_object) = record.as_object_mut() {
                        record_object.insert(
                            "secondDraft".to_string(),
                            second_record
                                .get("firstDraft")
                                .cloned()
                                .unwrap_or(serde_json::Value::Null),
                        );
                        record_object.insert(
                            "secondError".to_string(),
                            second_record
                                .get("error")
                                .cloned()
                                .unwrap_or(serde_json::Value::Null),
                        );
                    }
                }

                record
            })
            .collect::<Vec<_>>();
        let generated_at_unix_seconds = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time is after Unix epoch")
            .as_secs();
        let artifact = json!({
            "generatedAtUnixSeconds": generated_at_unix_seconds,
            "metadata": {
                "baseUrlHost": super::read_base_url_host(&config.base_url),
                "model": config.model,
                "promptVersion": config.prompt_version,
                "schemaVersion": config.schema_version,
                "temperature": config.temperature
            },
            "results": records
        });
        let output_path = PathBuf::from(output_path);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).expect("artifact parent directory can be created");
        }

        fs::write(
            output_path,
            format!(
                "{}\n",
                serde_json::to_string_pretty(&artifact).expect("artifact serializes")
            ),
        )
        .expect("artifact can be written");
    }

    #[test]
    fn scene_generation_cache_key_changes_with_prompt_and_generation_config() {
        let config = super::SceneGenerationConfig {
            base_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-test".to_string(),
            prompt_version: 1,
            schema_version: 1,
            temperature: 0.0,
        };
        let same_key = super::build_scene_generation_cache_key(&config, "生成小球自由落体");
        let repeated_key = super::build_scene_generation_cache_key(&config, "生成小球自由落体");
        let different_prompt_key =
            super::build_scene_generation_cache_key(&config, "生成斜面木块下滑");
        let different_model_key = super::build_scene_generation_cache_key(
            &super::SceneGenerationConfig {
                model: "gpt-other".to_string(),
                ..config.clone()
            },
            "生成小球自由落体",
        );

        assert_eq!(same_key, repeated_key);
        assert_ne!(same_key, different_prompt_key);
        assert_ne!(same_key, different_model_key);
        assert!(same_key.starts_with("scene-draft-v1-prompt-v1-"));
        assert!(same_key.ends_with(".json"));
    }

    #[test]
    fn scene_generation_cache_round_trips_with_safe_cache_keys() {
        let cache_dir = std::env::temp_dir().join(format!(
            "physics-sandbox-scene-cache-test-{}",
            std::process::id()
        ));
        let cache_key = "scene-draft-v1-prompt-v1-test.json";
        let draft =
            "{\"schemaVersion\":1,\"domain\":\"mechanics\",\"entities\":[],\"relationships\":[]}";

        let missing = super::read_scene_generation_cache_entry(&cache_dir, cache_key)
            .expect("missing cache read is not fatal");
        assert_eq!(missing, None);

        super::write_scene_generation_cache_entry(&cache_dir, cache_key, draft)
            .expect("cache write succeeds");
        let cached = super::read_scene_generation_cache_entry(&cache_dir, cache_key)
            .expect("cache read succeeds");

        assert_eq!(cached.as_deref(), Some(draft));
        assert!(super::read_scene_generation_cache_entry(&cache_dir, "../escape.json").is_err());
        assert!(
            super::write_scene_generation_cache_entry(&cache_dir, "bad/key.json", draft).is_err()
        );

        let _ = std::fs::remove_dir_all(cache_dir);
    }

    #[test]
    fn scene_generation_cache_ignores_invalid_or_mismatched_schema_entries() {
        let cache_dir = std::env::temp_dir().join(format!(
            "physics-sandbox-scene-cache-invalid-test-{}",
            std::process::id()
        ));
        let invalid_cache_key = "scene-draft-v1-prompt-v1-invalid.json";
        let mismatched_cache_key = "scene-draft-v1-prompt-v1-mismatched.json";
        let invalid_cache_path =
            super::scene_generation_cache_entry_path(&cache_dir, invalid_cache_key)
                .expect("invalid cache fixture path is safe");
        let mismatched_cache_path =
            super::scene_generation_cache_entry_path(&cache_dir, mismatched_cache_key)
                .expect("mismatched cache fixture path is safe");

        fs::create_dir_all(&cache_dir).expect("cache fixture directory can be created");
        fs::write(invalid_cache_path, "not-json").expect("invalid fixture can be written");
        fs::write(mismatched_cache_path, "{\"schemaVersion\":2}")
            .expect("mismatched fixture can be written");

        assert_eq!(
            super::read_scene_generation_cache_entry(&cache_dir, invalid_cache_key)
                .expect("invalid cache read is recoverable"),
            None
        );
        assert_eq!(
            super::read_scene_generation_cache_entry(&cache_dir, mismatched_cache_key)
                .expect("schema-mismatched cache read is recoverable"),
            None
        );

        let _ = std::fs::remove_dir_all(cache_dir);
    }

    #[test]
    fn scene_generation_cache_does_not_persist_invalid_entries() {
        let cache_dir = std::env::temp_dir().join(format!(
            "physics-sandbox-scene-cache-write-invalid-test-{}",
            std::process::id()
        ));
        let invalid_cache_key = "scene-draft-v1-prompt-v1-invalid-write.json";
        let invalid_cache_path =
            super::scene_generation_cache_entry_path(&cache_dir, invalid_cache_key)
                .expect("invalid cache fixture path is safe");

        super::write_scene_generation_cache_entry(&cache_dir, invalid_cache_key, "not-json")
            .expect("invalid cache writes are recoverable no-ops");

        assert!(!invalid_cache_path.exists());

        let _ = std::fs::remove_dir_all(cache_dir);
    }

    #[test]
    fn openai_scene_generation_retries_schema_request_on_server_errors_only() {
        assert!(super::should_retry_openai_scene_draft_without_schema(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        ));
        assert!(super::should_retry_openai_scene_draft_without_schema(
            reqwest::StatusCode::BAD_GATEWAY
        ));
        assert!(super::should_retry_openai_scene_draft_without_schema(
            reqwest::StatusCode::TOO_MANY_REQUESTS
        ));
        assert!(!super::should_retry_openai_scene_draft_without_schema(
            reqwest::StatusCode::UNAUTHORIZED
        ));
        assert!(!super::should_retry_openai_scene_draft_without_schema(
            reqwest::StatusCode::BAD_REQUEST
        ));
    }

    #[test]
    fn scene_draft_json_schema_supports_arc_tracks_endpoint_connections_contact_springs_and_energy_release()
     {
        let schema = super::scene_draft_json_schema();
        let entity_kind_enum =
            &schema["properties"]["entities"]["items"]["properties"]["kind"]["enum"];
        let required = schema["required"]
            .as_array()
            .expect("required fields are listed");
        let relationship_variants = schema["properties"]["relationships"]["items"]["anyOf"]
            .as_array()
            .expect("relationship variants are listed");

        assert_eq!(schema["properties"]["schemaVersion"]["const"], json!(1));
        assert!(required.contains(&json!("schemaVersion")));
        assert!(
            entity_kind_enum
                .as_array()
                .expect("entity kind enum is listed")
                .contains(&json!("arc-track"))
        );
        assert!(relationship_variants.iter().any(|variant| {
            variant["properties"]["kind"]["enum"]
                .as_array()
                .is_some_and(|kinds| kinds.contains(&json!("connect-endpoints")))
        }));
        assert!(relationship_variants.iter().any(|variant| {
            variant["properties"]["kind"]["enum"]
                .as_array()
                .is_some_and(|kinds| kinds.contains(&json!("contact-spring-end")))
        }));
        assert!(relationship_variants.iter().any(|variant| {
            variant["properties"]["kind"]["enum"]
                .as_array()
                .is_some_and(|kinds| kinds.contains(&json!("energy-release")))
        }));
    }

    #[test]
    fn scene_draft_prompt_uses_energy_release_for_detached_micro_springs() {
        let prompt = super::build_scene_draft_system_prompt();

        assert!(prompt.contains("use energy-release"));
        assert!(prompt.contains("instead of creating any spring constraint"));
    }

    fn sample_scene_draft_json() -> serde_json::Value {
        json!({
            "title": "放置木板",
            "locale": "zh-CN",
            "domain": "mechanics",
            "gravity": 10,
            "entities": [
                {
                    "kind": "board",
                    "name": "木板",
                    "mass": null,
                    "friction": 0,
                    "restitution": null,
                    "locked": true,
                    "initialVelocity": null,
                    "length": 3,
                    "width": null,
                    "height": 0.12,
                    "radius": null,
                    "angleDegrees": 0
                }
            ],
            "relationships": [],
            "analyzers": [],
            "assumptions": [],
            "warnings": [],
            "unsupported": []
        })
    }

    #[test]
    fn extract_openai_response_text_accepts_direct_scene_draft_json() {
        let draft = sample_scene_draft_json();

        assert_eq!(
            super::extract_openai_response_text(&draft.to_string()).as_deref(),
            Ok(draft.to_string().as_str())
        );
    }

    #[test]
    fn extract_openai_response_text_reads_responses_output_text() {
        let draft = sample_scene_draft_json().to_string();
        let response = json!({
            "id": "resp_test",
            "output_text": draft
        });

        assert_eq!(
            super::extract_openai_response_text(&response.to_string()).as_deref(),
            Ok(draft.as_str())
        );
    }

    #[test]
    fn extract_openai_response_text_strips_json_code_fence() {
        let draft = sample_scene_draft_json().to_string();
        let response = json!({
            "output_text": format!("```json\n{draft}\n```")
        });

        assert_eq!(
            super::extract_openai_response_text(&response.to_string()).as_deref(),
            Ok(draft.as_str())
        );
    }

    #[test]
    fn extract_openai_response_text_reads_chat_completion_message_content() {
        let draft = sample_scene_draft_json().to_string();
        let response = json!({
            "choices": [
                {
                    "message": {
                        "content": draft
                    }
                }
            ]
        });

        assert_eq!(
            super::extract_openai_response_text(&response.to_string()).as_deref(),
            Ok(draft.as_str())
        );
    }

    #[test]
    fn extract_openai_response_text_combines_streaming_deltas() {
        let draft = sample_scene_draft_json().to_string();
        let split = draft.len() / 2;
        let body = format!(
            "event: response.output_text.delta\n\
             data: {{\"delta\":{}}}\n\n\
             event: response.output_text.delta\n\
             data: {{\"delta\":{}}}\n\n\
             data: [DONE]\n",
            serde_json::to_string(&draft[..split]).expect("first delta serializes"),
            serde_json::to_string(&draft[split..]).expect("second delta serializes")
        );

        assert_eq!(
            super::extract_openai_response_text(&body).as_deref(),
            Ok(draft.as_str())
        );
    }

    #[test]
    fn extract_openai_response_text_rejects_empty_body() {
        let error = super::extract_openai_response_text(" \n\t").expect_err("empty body rejects");

        assert_eq!(error, "OpenAI response body was empty.");
    }

    #[test]
    fn extract_openai_response_text_rejects_empty_generated_text() {
        let response = json!({
            "output_text": " \n\t"
        });

        let error = super::extract_openai_response_text(&response.to_string())
            .expect_err("empty text rejects");

        assert_eq!(error, "OpenAI generated text was empty.");
    }

    #[test]
    fn read_desktop_config_value_prefers_process_env_over_local_file() {
        let key = "PHYSICS_SANDBOX_TEST_OPENAI_BASE_URL";
        unsafe {
            std::env::set_var(key, "https://env.example.com/v1");
        }
        let local_env =
            HashMap::from([(key.to_string(), "https://file.example.com/v1".to_string())]);

        assert_eq!(
            read_desktop_config_value(key, &local_env).as_deref(),
            Ok("https://env.example.com/v1")
        );

        unsafe {
            std::env::remove_var(key);
        }
    }

    #[test]
    fn trim_env_value_removes_matching_quotes() {
        assert_eq!(trim_env_value("  \"secret\"  "), "secret");
        assert_eq!(trim_env_value("  'secret'  "), "secret");
        assert_eq!(trim_env_value(" secret "), "secret");
    }

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
    fn write_export_text_file_writes_the_selected_export_path() {
        let path = std::env::temp_dir().join(format!(
            "physics-sandbox-export-test-{}.json",
            std::process::id()
        ));

        let _ = fs::remove_file(&path);
        write_export_text_contents(&path, "{\"ok\":true}").expect("export file writes");

        assert_eq!(
            fs::read_to_string(&path).expect("export file is readable"),
            "{\"ok\":true}"
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn build_desktop_app_registers_export_file_write_command() {
        let app =
            build_desktop_app(mock_builder(), mock_context(noop_assets())).expect("app builds");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("webview builds");
        let path = std::env::temp_dir().join(format!(
            "physics-sandbox-ipc-export-test-{}.json",
            std::process::id()
        ));

        let _ = fs::remove_file(&path);
        let response = get_ipc_response(
            &webview,
            invoke_request_with_body(
                "write_export_text_file",
                json!({
                    "path": path,
                    "contents": "{\"saved\":true}"
                }),
            ),
        )
        .expect("export write command succeeds");
        let saved_path = response
            .deserialize::<String>()
            .expect("saved path deserializes");

        assert_eq!(PathBuf::from(saved_path), path);
        assert_eq!(
            fs::read_to_string(&path).expect("export file is readable"),
            "{\"saved\":true}"
        );

        let _ = fs::remove_file(&path);
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
