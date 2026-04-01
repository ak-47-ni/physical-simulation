use serde_json::json;
use sim_core::bridge::{BridgeError, RuntimeCompileRequest, SceneKindRecord, SimulationBridge};
use sim_core::scene::SceneCompileError;

fn compile_request(
    constraints: serde_json::Value,
    force_sources: serde_json::Value,
    analyzers: serde_json::Value,
) -> RuntimeCompileRequest {
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
fn runtime_compile_validation_rejects_invalid_spring_constraints() {
    let request = compile_request(
        json!([
            {
                "id": "spring-1",
                "kind": "spring",
                "entityAId": "poly-1",
                "entityBId": "poly-1",
                "restLength": 0.0,
                "stiffness": 12.0
            }
        ]),
        json!([
            {
                "id": "gravity-1",
                "kind": "gravity",
                "acceleration": { "x": 0.0, "y": -9.81 }
            }
        ]),
        json!([]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::SceneCompile(
            SceneCompileError::InvalidSpringRestLength {
                constraint_id: "spring-1".to_string(),
                value: 0.0,
            }
        ))
    );
}

#[test]
fn runtime_compile_validation_accepts_arc_tracks_without_entity_binding() {
    let request = compile_request(
        json!([
            {
                "id": "arc-track-1",
                "kind": "arc-track",
                "center": { "x": 0.0, "y": 2.0 },
                "radius": 3.0,
                "startAngleDegrees": 180.0,
                "endAngleDegrees": 315.0,
                "side": "inside",
                "entryEndpoint": "start"
            }
        ]),
        json!([
            {
                "id": "gravity-1",
                "kind": "gravity",
                "acceleration": { "x": 0.0, "y": -9.81 }
            }
        ]),
        json!([]),
    );

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("free-entry arc-track payload should compile");

    assert_eq!(frame.frame_number, 0);
    assert_eq!(frame.entities.len(), 1);
}

#[test]
fn runtime_compile_validation_rejects_legacy_arc_track_entity_binding_field() {
    let error = serde_json::from_value::<RuntimeCompileRequest>(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 0.0,
                    "y": -2.0,
                    "radius": 0.5
                }
            ],
            "constraints": [
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "entityId": "ball-1",
                    "center": { "x": 0.0, "y": 0.0 },
                    "radius": 2.0,
                    "startAngleDegrees": 180.0,
                    "endAngleDegrees": 315.0,
                    "side": "inside",
                    "entryEndpoint": "start"
                }
            ],
            "forceSources": [
                {
                    "id": "gravity-1",
                    "kind": "gravity",
                    "acceleration": { "x": 0.0, "y": -9.81 }
                }
            ],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect_err("legacy arc-track entityId should be rejected");

    assert!(error.to_string().contains("entityId"));
}

#[test]
fn runtime_compile_validation_rejects_invalid_arc_track_spans() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 0.0,
                    "y": -2.0,
                    "radius": 0.5
                }
            ],
            "constraints": [
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "center": { "x": 0.0, "y": 0.0 },
                    "radius": 2.0,
                    "startAngleDegrees": 0.0,
                    "endAngleDegrees": 360.0,
                    "side": "inside",
                    "entryEndpoint": "start"
                }
            ],
            "forceSources": [
                {
                    "id": "gravity-1",
                    "kind": "gravity",
                    "acceleration": { "x": 0.0, "y": -9.81 }
                }
            ],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("arc-track payload should deserialize");

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::SceneCompile(
            SceneCompileError::InvalidArcTrackSpan {
                constraint_id: "arc-track-1".to_string(),
                start_angle_degrees: 0.0,
                end_angle_degrees: 360.0,
            }
        ))
    );
}

#[test]
fn runtime_compile_validation_requires_explicit_gravity_force_sources() {
    let request = compile_request(json!([]), json!([]), json!([]));

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::SceneCompile(SceneCompileError::MissingGravity))
    );
}

#[test]
fn runtime_compile_validation_rejects_trajectory_analyzers_without_entity_binding() {
    let request = compile_request(
        json!([]),
        json!([
            {
                "id": "gravity-1",
                "kind": "gravity",
                "acceleration": { "x": 0.0, "y": -9.81 }
            }
        ]),
        json!([{ "id": "traj-1", "kind": "trajectory" }]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::IncompleteAnalyzerRecord {
            id: "traj-1".to_string(),
            kind: "trajectory".to_string(),
            missing_field: "entityId".to_string(),
        })
    );
}

#[test]
fn runtime_compile_validation_rejects_unknown_analyzer_kinds() {
    let request = compile_request(
        json!([]),
        json!([
            {
                "id": "gravity-1",
                "kind": "gravity",
                "acceleration": { "x": 0.0, "y": -9.81 }
            }
        ]),
        json!([{ "id": "probe-1", "kind": "probe", "entityId": "poly-1" }]),
    );

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::UnsupportedSceneRecord {
            section: "analyzers".to_string(),
            record: SceneKindRecord {
                id: "probe-1".to_string(),
                kind: "probe".to_string(),
            },
        })
    );
}

#[test]
fn runtime_compile_validation_rejects_ball_entities_without_radius() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 120.0,
                    "y": 140.0
                }
            ],
            "constraints": [],
            "forceSources": [
                {
                    "id": "gravity-1",
                    "kind": "gravity",
                    "acceleration": { "x": 0.0, "y": -9.81 }
                }
            ],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("editor-style entity payload should deserialize");

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::IncompleteEntityRecord {
            id: "ball-1".to_string(),
            kind: "ball".to_string(),
            missing_field: "radius".to_string(),
        })
    );
}
