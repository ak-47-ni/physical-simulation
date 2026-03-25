use serde_json::json;
use sim_core::bridge::{RuntimeCompileRequest, SimulationBridge};

fn gravity_force_source() -> serde_json::Value {
    json!([
        {
            "id": "gravity-1",
            "kind": "gravity",
            "acceleration": { "x": 0.0, "y": -9.81 }
        }
    ])
}

fn elastic_bounce_request(
    ball_restitution: Option<f64>,
    board_restitution: Option<f64>,
) -> RuntimeCompileRequest {
    let mut ball = json!({
        "id": "ball-1",
        "kind": "ball",
        "x": 132.0,
        "y": 96.0,
        "radius": 24.0,
        "locked": false,
        "velocityX": 0.0,
        "velocityY": -40.0
    });
    let mut board = json!({
        "id": "board-1",
        "kind": "board",
        "x": 80.0,
        "y": 0.0,
        "width": 240.0,
        "height": 16.0,
        "locked": true,
        "velocityX": 0.0,
        "velocityY": 0.0
    });

    if let Some(value) = ball_restitution {
        ball["restitution"] = json!(value);
    }

    if let Some(value) = board_restitution {
        board["restitution"] = json!(value);
    }

    serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [board, ball],
            "constraints": [],
            "forceSources": gravity_force_source(),
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("elastic bounce request should deserialize")
}

fn max_upward_velocity_over_steps(request: RuntimeCompileRequest, steps: usize) -> f64 {
    let mut bridge = SimulationBridge::new(1.0 / 240.0);
    bridge
        .compile_runtime_request(request)
        .expect("request should compile into runtime state");

    let mut max_upward_velocity = f64::NEG_INFINITY;

    for _ in 0..steps {
        let frame = bridge.step().expect("runtime should step");
        let velocity_y = frame
            .entities
            .iter()
            .find(|entity| entity.entity_id == "ball-1")
            .expect("ball should exist")
            .velocity
            .y;
        max_upward_velocity = max_upward_velocity.max(velocity_y);
    }

    max_upward_velocity
}

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
            "forceSources": gravity_force_source(),
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
            "forceSources": gravity_force_source(),
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
            "forceSources": gravity_force_source(),
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
            "forceSources": gravity_force_source(),
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
            "forceSources": gravity_force_source(),
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

#[test]
fn serialization_contract_missing_restitution_defaults_to_fully_elastic_runtime_behavior() {
    let max_upward_velocity =
        max_upward_velocity_over_steps(elastic_bounce_request(None, None), 480);

    assert!(
        max_upward_velocity > 15.0,
        "max_upward_velocity={}",
        max_upward_velocity
    );
}

#[test]
fn serialization_contract_explicit_restitution_values_override_elastic_fallbacks() {
    let default_velocity = max_upward_velocity_over_steps(elastic_bounce_request(None, None), 480);
    let damped_velocity =
        max_upward_velocity_over_steps(elastic_bounce_request(Some(0.2), Some(0.2)), 480);

    assert!(
        default_velocity > damped_velocity + 5.0,
        "default_velocity={} damped_velocity={}",
        default_velocity,
        damped_velocity
    );
}
