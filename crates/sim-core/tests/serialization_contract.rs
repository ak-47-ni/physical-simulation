use serde_json::json;
use sim_core::bridge::{RuntimeCompileRequest, SimulationBridge};

#[test]
fn serialization_contract_accepts_frontend_compile_request_shape() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ramp-1",
                    "kind": "user-polygon",
                    "points": [
                        { "x": 0.0, "y": 0.0 },
                        { "x": 4.0, "y": 0.0 },
                        { "x": 4.0, "y": 2.0 },
                        { "x": 0.0, "y": 2.0 }
                    ]
                }
            ],
            "constraints": [],
            "forceSources": [],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["analysis"],
        "rebuildRequired": false
    }))
    .expect("frontend compile request shape should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("frontend compile request should compile into runtime state");

    assert_eq!(frame.frame_number, 0);
    assert_eq!(frame.entities.len(), 1);
    assert_eq!(frame.entities[0].entity_id, "ramp-1");
}

#[test]
fn serialization_contract_runtime_frame_payload_uses_frontend_keys() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
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
            "constraints": [],
            "forceSources": [],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("frontend compile request shape should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("frontend compile request should compile into runtime state");
    let value = serde_json::to_value(frame).expect("runtime frame should serialize");

    assert_eq!(value["frameNumber"], json!(0));
    assert_eq!(value["entities"][0]["entityId"], json!("poly-1"));
    assert_eq!(value["entities"][0]["position"]["x"], json!(0.0));
}

#[test]
fn serialization_contract_accepts_enriched_trajectory_analyzer_payloads() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "probe-1",
                    "kind": "user-polygon",
                    "points": [
                        { "x": -1.0, "y": 0.0 },
                        { "x": 1.0, "y": 0.0 },
                        { "x": 1.0, "y": 2.0 },
                        { "x": -1.0, "y": 2.0 }
                    ]
                }
            ],
            "constraints": [],
            "forceSources": [],
            "analyzers": [
                {
                    "id": "traj-1",
                    "kind": "trajectory",
                    "entityId": "probe-1"
                }
            ],
            "annotations": []
        },
        "dirtyScopes": ["analysis"],
        "rebuildRequired": false
    }))
    .expect("enriched trajectory analyzer payload should deserialize");

    let mut bridge = SimulationBridge::new(1.0 / 60.0);
    bridge
        .compile_runtime_request(request)
        .expect("enriched analyzer payload should compile");
    bridge.step().expect("runtime step should succeed");

    let samples = bridge
        .analyzer_samples("traj-1")
        .expect("trajectory analyzer samples should be available");

    assert_eq!(samples[0].frame_number, 0);
    assert_eq!(samples.last().expect("sample").frame_number, 1);
}
