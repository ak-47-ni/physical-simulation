use sim_core::analyzer::AnalyzerDefinition;
use sim_core::bridge::{BridgeStatus, SimulationBridge};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::playback::{PlaybackConfig, PlaybackMode};
use sim_core::scene::CompileSceneRequest;

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn runtime_scene_request() -> CompileSceneRequest {
    CompileSceneRequest {
        entities: vec![EntityDefinition {
            id: "probe".to_string(),
            shape: ShapeDefinition::Block {
                width: 2.0,
                height: 1.0,
            },
            position: vector2(0.0, 3.0),
            rotation_radians: 0.0,
            initial_velocity: vector2(1.5, 0.0),
            mass: 1.0,
            is_static: false,
            friction_coefficient: 0.2,
            restitution_coefficient: 0.1,
        }],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![AnalyzerDefinition::Trajectory {
            id: "traj-1".to_string(),
            entity_id: "probe".to_string(),
        }],
    }
}

fn prepare_cached_bridge(duration_seconds: f64) -> SimulationBridge {
    let mut bridge = SimulationBridge::new(1.0 / 60.0);
    bridge
        .set_playback_config(PlaybackConfig {
            mode: PlaybackMode::Precomputed,
            precompute_duration_seconds: duration_seconds,
            ..PlaybackConfig::default()
        })
        .expect("precomputed config should be accepted");
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .start_or_resume_snapshot()
        .expect("precomputed playback should enter preparing mode");

    loop {
        let snapshot = bridge
            .tick_snapshot()
            .expect("precompute build ticks should succeed");

        if snapshot.status != BridgeStatus::Preparing {
            break;
        }
    }

    bridge
}

#[test]
fn bridge_precomputed_seek_reports_incremental_progress_and_cached_samples() {
    let mut bridge = SimulationBridge::new(1.0 / 60.0);
    bridge
        .set_playback_config(PlaybackConfig {
            mode: PlaybackMode::Precomputed,
            precompute_duration_seconds: 2.0,
            ..PlaybackConfig::default()
        })
        .expect("precomputed config should be accepted");
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");

    let preparing = bridge
        .start_or_resume_snapshot()
        .expect("precomputed playback should enter preparing mode");
    assert_eq!(preparing.status, BridgeStatus::Preparing);
    assert_eq!(preparing.preparing_progress, Some(0.0));
    assert!(!preparing.seekable);

    let mut observed_progress = Vec::new();
    let completed = loop {
        let snapshot = bridge
            .tick_snapshot()
            .expect("precompute build ticks should succeed");

        if let Some(progress) = snapshot.preparing_progress {
            observed_progress.push(progress);
        }

        if snapshot.status != BridgeStatus::Preparing {
            break snapshot;
        }
    };

    assert!(
        observed_progress
            .iter()
            .any(|progress| *progress > 0.0 && *progress < 1.0)
    );
    assert_eq!(completed.status, BridgeStatus::Running);
    assert_eq!(completed.preparing_progress, None);
    assert!(completed.seekable);

    let samples = bridge
        .read_trajectory_samples("traj-1")
        .expect("cached playback should expose the completed analyzer samples");
    assert_eq!(samples.last().map(|sample| sample.frame_number), Some(120));
}

#[test]
fn bridge_precomputed_seek_snaps_to_nearest_frame_without_recomputing_physics() {
    let mut bridge = prepare_cached_bridge(0.2);

    let paused = bridge
        .pause_snapshot()
        .expect("cached playback should pause");
    assert_eq!(paused.status, BridgeStatus::Paused);

    let sought = bridge
        .seek_to_time_snapshot(0.149)
        .expect("seek should snap to the nearest cached frame");
    assert_eq!(sought.status, BridgeStatus::Paused);
    assert_eq!(
        sought
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(9)
    );
    assert!((sought.current_time_seconds - 0.15).abs() < 1e-9);

    bridge
        .seek_to_time_snapshot(0.0)
        .expect("seek to the start should succeed");
    bridge
        .set_time_scale(2.0)
        .expect("double-speed cached playback should be accepted");
    bridge
        .start_or_resume_snapshot()
        .expect("cached playback should resume");

    let advanced = bridge
        .tick_snapshot()
        .expect("cached playback should advance the cursor by the playback speed");
    assert_eq!(
        advanced
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(2)
    );

    let expected = bridge
        .seek_to_time_snapshot(2.0 / 60.0)
        .expect("seek to the same cached frame should succeed");

    assert_eq!(advanced.current_frame, expected.current_frame);
}
