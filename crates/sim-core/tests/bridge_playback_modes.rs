use serde_json::json;
use sim_core::bridge::{BridgeStatus, SimulationBridge};
use sim_core::playback::{PlaybackConfig, PlaybackMode};

#[test]
fn bridge_playback_modes_default_to_realtime_with_status_metadata() {
    let bridge = SimulationBridge::new(1.0 / 60.0);

    let snapshot = bridge.status_snapshot();

    assert_eq!(snapshot.status, BridgeStatus::Idle);
    assert_eq!(snapshot.playback_mode, PlaybackMode::Realtime);
    assert_eq!(snapshot.total_duration_seconds, 40.0);
    assert_eq!(snapshot.preparing_progress, None);
    assert!(!snapshot.seekable);

    let value = serde_json::to_value(snapshot).expect("snapshot should serialize");
    assert_eq!(value["playbackMode"], json!("realtime"));
    assert_eq!(value["totalDurationSeconds"], json!(40.0));
    assert_eq!(value["preparingProgress"], serde_json::Value::Null);
    assert_eq!(value["seekable"], json!(false));
}

#[test]
fn bridge_playback_modes_allow_precomputed_duration_overrides() {
    let mut bridge = SimulationBridge::new(1.0 / 60.0);

    let snapshot = bridge
        .set_playback_config_snapshot(PlaybackConfig {
            mode: PlaybackMode::Precomputed,
            precompute_duration_seconds: 12.0,
            ..PlaybackConfig::default()
        })
        .expect("precomputed playback config should be accepted");

    assert_eq!(snapshot.status, BridgeStatus::Idle);
    assert_eq!(snapshot.playback_mode, PlaybackMode::Precomputed);
    assert_eq!(snapshot.total_duration_seconds, 12.0);
    assert_eq!(snapshot.preparing_progress, None);
    assert!(!snapshot.seekable);
}
