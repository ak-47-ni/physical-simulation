use sim_core::bridge::{BridgeBlockReason, BridgeStatus, SimulationBridge};
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
            initial_velocity: vector2(2.0, 0.0),
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
fn bridge_status_reports_idle_snapshot_before_compile() {
    let bridge = SimulationBridge::new(0.1);
    let snapshot = bridge.status_snapshot();

    assert_eq!(snapshot.status, BridgeStatus::Idle);
    assert!(snapshot.current_frame.is_none());
    assert_eq!(snapshot.current_time_seconds, 0.0);
    assert!(snapshot.can_resume);
    assert_eq!(snapshot.block_reason, None);
}

#[test]
fn bridge_status_tracks_running_paused_and_dirty_states() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");

    let compiled = bridge.status_snapshot();
    assert_eq!(compiled.status, BridgeStatus::Idle);
    assert!(compiled.current_frame.is_some());

    bridge.start_or_resume().expect("start should succeed");
    let running = bridge.status_snapshot();
    assert_eq!(running.status, BridgeStatus::Running);
    assert!(running.can_resume);

    bridge.step().expect("step should succeed");
    let stepped = bridge.status_snapshot();
    assert_eq!(
        stepped
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(1)
    );
    assert!(stepped.current_time_seconds > 0.0);

    bridge.pause().expect("pause should succeed");
    let paused = bridge.status_snapshot();
    assert_eq!(paused.status, BridgeStatus::Paused);

    bridge.mark_dirty();
    let dirty = bridge.status_snapshot();
    assert_eq!(dirty.status, BridgeStatus::Paused);
    assert!(!dirty.can_resume);
    assert_eq!(dirty.block_reason, Some(BridgeBlockReason::RebuildRequired));
}
