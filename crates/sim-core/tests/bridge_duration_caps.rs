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
fn bridge_duration_caps_realtime_stops_at_forty_seconds() {
    let mut bridge = SimulationBridge::new(1.0 / 60.0);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .start_or_resume_snapshot()
        .expect("realtime playback should start immediately");

    let mut snapshot = bridge.status_snapshot();
    for _ in 0..2400 {
        snapshot = bridge
            .tick_snapshot()
            .expect("realtime playback ticks should succeed until the cap");
    }

    assert_eq!(snapshot.status, BridgeStatus::Idle);
    assert_eq!(
        snapshot
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(2400)
    );
    assert!((snapshot.current_time_seconds - 40.0).abs() < 1e-9);
    assert_eq!(snapshot.total_duration_seconds, 40.0);

    let capped = bridge
        .tick_snapshot()
        .expect("ticks after the cap should keep the terminal snapshot stable");
    assert_eq!(capped.status, BridgeStatus::Idle);
    assert_eq!(
        capped
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(2400)
    );
    assert!((capped.current_time_seconds - 40.0).abs() < 1e-9);
}
