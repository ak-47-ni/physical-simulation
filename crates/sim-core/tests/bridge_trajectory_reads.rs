use sim_core::analyzer::AnalyzerDefinition;
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

#[test]
fn bridge_trajectory_reads_only_return_step_samples() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    assert_eq!(
        bridge.read_trajectory_samples("traj-1"),
        Err(BridgeError::UnknownAnalyzer {
            id: "traj-1".to_string(),
        })
    );

    bridge.step().expect("first step should succeed");
    bridge.step().expect("second step should succeed");

    let samples = bridge
        .read_trajectory_samples("traj-1")
        .expect("trajectory read should expose runtime step samples");

    assert_eq!(samples.len(), 2);
    assert_eq!(samples[0].frame_number, 1);
    assert_eq!(samples[1].frame_number, 2);
    assert_eq!(samples[0].time_seconds, 0.1);
    assert_eq!(samples[1].time_seconds, 0.2);
}

#[test]
fn bridge_trajectory_reads_clear_after_reset() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");
    bridge.step().expect("first step should succeed");

    assert!(bridge.read_trajectory_samples("traj-1").is_ok());

    bridge.reset().expect("reset should succeed");

    assert_eq!(
        bridge.read_trajectory_samples("traj-1"),
        Err(BridgeError::UnknownAnalyzer {
            id: "traj-1".to_string(),
        })
    );
}
