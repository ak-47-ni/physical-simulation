use serde_json::json;
use sim_core::bridge::{BridgeError, RuntimeCompileRequest, SceneKindRecord, SimulationBridge};

fn compile_request_with_scene_section(
    section: &str,
    records: serde_json::Value,
) -> RuntimeCompileRequest {
    let constraints = if section == "constraints" {
        records.clone()
    } else {
        json!([])
    };
    let force_sources = if section == "forceSources" {
        records.clone()
    } else {
        json!([])
    };
    let analyzers = if section == "analyzers" {
        records
    } else {
        json!([])
    };

    serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "poly-1",
                    "kind": "user-polygon",
                    "points": [
                        { "x": -1.0, "y": 0.0 },
                        { "x": 1.0, "y": 0.0 },
                        { "x": 1.0, "y": 2.0 },
                        { "x": -1.0, "y": 2.0 }
                    ]
                }
            ],
            "constraints": constraints,
            "forceSources": force_sources,
            "analyzers": analyzers,
            "annotations": []
        },
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("runtime compile request shape should deserialize")
}

#[test]
fn runtime_compile_validation_rejects_unsupported_constraints() {
    let request = compile_request_with_scene_section(
        "constraints",
        json!([{ "id": "spring-1", "kind": "spring" }]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::UnsupportedSceneRecord {
            section: "constraints".to_string(),
            record: SceneKindRecord {
                id: "spring-1".to_string(),
                kind: "spring".to_string(),
            },
        })
    );
}

#[test]
fn runtime_compile_validation_rejects_unsupported_force_sources() {
    let request = compile_request_with_scene_section(
        "forceSources",
        json!([{ "id": "gravity-1", "kind": "gravity" }]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::UnsupportedSceneRecord {
            section: "forceSources".to_string(),
            record: SceneKindRecord {
                id: "gravity-1".to_string(),
                kind: "gravity".to_string(),
            },
        })
    );
}

#[test]
fn runtime_compile_validation_rejects_unsupported_analyzers() {
    let request = compile_request_with_scene_section(
        "analyzers",
        json!([{ "id": "traj-1", "kind": "trajectory" }]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::UnsupportedSceneRecord {
            section: "analyzers".to_string(),
            record: SceneKindRecord {
                id: "traj-1".to_string(),
                kind: "trajectory".to_string(),
            },
        })
    );
}
