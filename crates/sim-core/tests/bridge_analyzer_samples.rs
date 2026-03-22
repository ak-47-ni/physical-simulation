use serde_json::json;
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
fn bridge_analyzer_samples_follow_runtime_steps() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    bridge.step().expect("first step should succeed");
    bridge.step().expect("second step should succeed");

    let samples = bridge
        .analyzer_samples("traj-1")
        .expect("trajectory analyzer samples should be available");

    assert!(samples.len() >= 3);
    assert_eq!(samples[0].frame_number, 0);
    assert_eq!(samples.last().expect("sample").frame_number, 2);
    assert!(samples.last().expect("sample").position.x > samples[0].position.x);
}

#[test]
fn bridge_analyzer_samples_reject_unknown_analyzer_ids() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    assert_eq!(
        bridge.analyzer_samples("missing-analyzer"),
        Err(BridgeError::UnknownAnalyzer {
            id: "missing-analyzer".to_string(),
        })
    );
}

#[test]
fn bridge_analyzer_samples_serialize_with_frontend_keys() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    let samples = bridge
        .analyzer_samples("traj-1")
        .expect("trajectory analyzer samples should be available");
    let value = serde_json::to_value(&samples[0]).expect("sample should serialize");

    assert_eq!(value["frameNumber"], json!(0));
    assert_eq!(value["timeSeconds"], json!(0.0));
    assert_eq!(value["position"]["x"], json!(0.0));
}
