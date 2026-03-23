use sim_core::bridge::{BridgeError, BridgeStatus, SimulationBridge};
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
fn bridge_contract_accepts_compile_scene_command() {
    let mut bridge = SimulationBridge::new(0.1);

    let frame = bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    assert_eq!(frame.frame_number, 0);
    assert_eq!(frame.entities.len(), 1);
    assert_eq!(frame.entities[0].entity_id, "block-1");
}

#[test]
fn bridge_contract_step_returns_runtime_frame_payload() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    let frame = bridge.step().expect("step should return a frame payload");

    assert_eq!(frame.frame_number, 1);
    assert!(frame.entities[0].position.x > 0.0);
}

#[test]
fn bridge_contract_reset_rebuilds_from_compile_baseline() {
    let mut bridge = SimulationBridge::new(0.1);
    let baseline = bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    bridge.step().expect("first step should succeed");
    bridge.step().expect("second step should succeed");
    let reset_frame = bridge.reset().expect("reset should rebuild from baseline");

    assert_eq!(reset_frame, baseline);
}

#[test]
fn bridge_contract_dirty_scene_blocks_resume_until_rebuild() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    bridge.mark_dirty();

    assert_eq!(
        bridge.start_or_resume(),
        Err(BridgeError::DirtySceneRequiresRebuild)
    );

    bridge
        .compile_scene(runtime_scene_request())
        .expect("recompile should clear dirty state");

    assert!(bridge.start_or_resume().is_ok());
}

#[test]
fn bridge_contract_snapshot_controls_report_runtime_state_transitions() {
    let mut bridge = SimulationBridge::new(0.1);

    let compiled = bridge
        .compile_scene_snapshot(runtime_scene_request())
        .expect("scene should compile into an idle snapshot");
    assert_eq!(compiled.status, BridgeStatus::Idle);
    assert_eq!(
        compiled.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(0)
    );

    let running = bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");
    assert_eq!(running.status, BridgeStatus::Running);
    assert!(running.can_resume);

    let stepped = bridge.step_snapshot().expect("step should return a stepped snapshot");
    assert_eq!(stepped.status, BridgeStatus::Running);
    assert_eq!(
        stepped.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(1)
    );
    assert!(stepped.current_time_seconds > 0.0);

    let paused = bridge.pause_snapshot().expect("pause should return a paused snapshot");
    assert_eq!(paused.status, BridgeStatus::Paused);
    assert_eq!(
        paused.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(1)
    );

    let reset = bridge.reset_snapshot().expect("reset should return a reset snapshot");
    assert_eq!(reset.status, BridgeStatus::Idle);
    assert_eq!(reset.current_time_seconds, 0.0);
    assert_eq!(
        reset.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(0)
    );
}
