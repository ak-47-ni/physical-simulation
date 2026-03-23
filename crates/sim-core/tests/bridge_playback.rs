use sim_core::bridge::{BridgeStatus, SimulationBridge};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::scene::CompileSceneRequest;

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn runtime_scene_request() -> CompileSceneRequest {
    CompileSceneRequest {
        entities: vec![EntityDefinition {
            id: "block-1".to_string(),
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
        analyzers: vec![],
    }
}

#[test]
fn bridge_playback_running_tick_advances_the_runtime_frame() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");

    let snapshot = bridge
        .tick_snapshot()
        .expect("running playback tick should advance the frame");

    assert_eq!(snapshot.status, BridgeStatus::Running);
    assert_eq!(
        snapshot.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(1)
    );
    assert!((snapshot.current_time_seconds - 0.1).abs() < 1e-9);
}

#[test]
fn bridge_playback_paused_tick_does_not_advance_the_runtime_frame() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");
    bridge.pause_snapshot().expect("pause should succeed");

    let snapshot = bridge
        .tick_snapshot()
        .expect("paused playback tick should return the existing snapshot");

    assert_eq!(snapshot.status, BridgeStatus::Paused);
    assert_eq!(
        snapshot.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(0)
    );
    assert_eq!(snapshot.current_time_seconds, 0.0);
}

#[test]
fn bridge_playback_reset_after_ticks_returns_to_frame_zero() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");
    bridge.tick_snapshot().expect("first tick should succeed");
    bridge.tick_snapshot().expect("second tick should succeed");

    let snapshot = bridge
        .reset_snapshot()
        .expect("reset should rebuild the baseline frame");

    assert_eq!(snapshot.status, BridgeStatus::Idle);
    assert_eq!(
        snapshot.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(0)
    );
    assert_eq!(snapshot.current_time_seconds, 0.0);
}

#[test]
fn bridge_playback_tick_uses_the_current_time_scale() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .set_time_scale(0.5)
        .expect("half-speed time scale should be accepted");
    bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");

    let half_speed = bridge
        .tick_snapshot()
        .expect("half-speed playback tick should succeed");
    assert!((half_speed.current_time_seconds - 0.05).abs() < 1e-9);

    bridge
        .set_time_scale(2.0)
        .expect("double-speed time scale should be accepted");

    let double_speed = bridge
        .tick_snapshot()
        .expect("double-speed playback tick should succeed");
    assert!((double_speed.current_time_seconds - 0.25).abs() < 1e-9);
}
