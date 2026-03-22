use sim_core::bridge::{BridgeBlockReason, DirtyEditScope, SimulationBridge};
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
fn bridge_scopes_analysis_and_annotation_edits_do_not_block_resume() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");

    bridge.mark_dirty_scopes(&[DirtyEditScope::Analysis, DirtyEditScope::Annotation]);

    let snapshot = bridge.status_snapshot();
    assert!(snapshot.can_resume);
    assert_eq!(snapshot.block_reason, None);
    assert!(bridge.start_or_resume().is_ok());
}

#[test]
fn bridge_scopes_physics_and_structure_edits_require_rebuild_before_resume() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile");

    bridge.mark_dirty_scopes(&[DirtyEditScope::Physics]);
    let physics_snapshot = bridge.status_snapshot();
    assert!(!physics_snapshot.can_resume);
    assert_eq!(
        physics_snapshot.block_reason,
        Some(BridgeBlockReason::RebuildRequired)
    );

    bridge
        .compile_scene(runtime_scene_request())
        .expect("recompile should clear dirty physics state");
    bridge.mark_dirty_scopes(&[DirtyEditScope::Structure]);
    let structure_snapshot = bridge.status_snapshot();
    assert!(!structure_snapshot.can_resume);
    assert_eq!(
        structure_snapshot.block_reason,
        Some(BridgeBlockReason::RebuildRequired)
    );
}
