use serde_json::json;
use sim_core::bridge::{BridgeError, SimulationBridge};
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
            initial_velocity: vector2(1.0, 0.0),
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
fn bridge_time_scale_updates_step_duration_and_status_snapshot() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");

    let half_speed = bridge
        .set_time_scale(0.5)
        .expect("half-speed time scale should be accepted");
    assert_eq!(half_speed.time_scale, 0.5);

    bridge.step().expect("step at half-speed should succeed");
    let first_step = bridge.status_snapshot();
    assert_eq!(first_step.time_scale, 0.5);
    assert_eq!(
        first_step
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(1)
    );
    assert!((first_step.current_time_seconds - 0.05).abs() < 1e-9);

    bridge
        .set_time_scale(2.0)
        .expect("double-speed time scale should be accepted");
    bridge.step().expect("step at double-speed should succeed");
    let second_step = bridge.status_snapshot();

    assert_eq!(second_step.time_scale, 2.0);
    assert_eq!(
        second_step
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(2)
    );
    assert!((second_step.current_time_seconds - 0.25).abs() < 1e-9);
}

#[test]
fn bridge_time_scale_rejects_non_positive_values() {
    let mut bridge = SimulationBridge::new(0.1);

    assert_eq!(
        bridge.set_time_scale(0.0),
        Err(BridgeError::InvalidTimeScale { value: 0.0 })
    );
    assert_eq!(
        bridge.set_time_scale(-1.0),
        Err(BridgeError::InvalidTimeScale { value: -1.0 })
    );
}

#[test]
fn bridge_time_scale_status_snapshot_serializes_with_frontend_key() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .set_time_scale(0.25)
        .expect("quarter-speed time scale should be accepted");

    let value = serde_json::to_value(bridge.status_snapshot()).expect("snapshot should serialize");

    assert_eq!(value["timeScale"], json!(0.25));
}

#[test]
fn bridge_time_scale_reset_restores_default_scale() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");
    bridge
        .set_time_scale(2.0)
        .expect("double-speed time scale should be accepted");
    bridge.step().expect("step at double-speed should succeed");

    bridge.reset().expect("reset should succeed");
    let snapshot = bridge.status_snapshot();

    assert_eq!(snapshot.time_scale, 1.0);
    assert_eq!(snapshot.current_time_seconds, 0.0);
    assert_eq!(
        snapshot
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(0)
    );
}
