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

#[test]
fn serialization_contract_accepts_editor_ball_payloads_with_physics_fields() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 132.0,
                    "y": 176.0,
                    "radius": 24.0,
                    "mass": 1.2,
                    "friction": 0.14,
                    "restitution": 0.82,
                    "locked": false,
                    "velocityX": 12.0,
                    "velocityY": -6.0
                }
            ],
            "constraints": [],
            "forceSources": [],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("editor ball payload should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("editor ball payload should compile into runtime state");

    assert_eq!(frame.entities[0].entity_id, "ball-1");
    assert_eq!(frame.entities[0].position.x, 156.0);
    assert_eq!(frame.entities[0].position.y, 200.0);
    assert_eq!(frame.entities[0].velocity.x, 12.0);
    assert_eq!(frame.entities[0].velocity.y, -6.0);
}

#[test]
fn serialization_contract_accepts_locked_board_payloads_as_static_runtime_entities() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "board-1",
                    "kind": "board",
                    "x": 318.0,
                    "y": 272.0,
                    "width": 120.0,
                    "height": 18.0,
                    "mass": 5.0,
                    "friction": 0.42,
                    "restitution": 0.18,
                    "locked": true,
                    "velocityX": 0.0,
                    "velocityY": 0.0
                }
            ],
            "constraints": [],
            "forceSources": [],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("editor board payload should deserialize");

    let mut bridge = SimulationBridge::new(1.0 / 60.0);
    let baseline = bridge
        .compile_runtime_request(request)
        .expect("editor board payload should compile into runtime state");
    let stepped = bridge
        .step()
        .expect("locked board runtime should still step");

    assert_eq!(baseline.entities[0].entity_id, "board-1");
    assert_eq!(baseline.entities[0].position.x, 378.0);
    assert_eq!(baseline.entities[0].position.y, 281.0);
    assert_eq!(baseline.entities[0].acceleration.x, 0.0);
    assert_eq!(baseline.entities[0].acceleration.y, 0.0);
    assert_eq!(stepped.entities[0].position.x, 378.0);
    assert_eq!(stepped.entities[0].position.y, 281.0);
}
