use serde_json::json;
use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackCapturePolicy, CompiledArcTrackAnchor,
};
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
fn runtime_compile_validation_normalizes_non_positive_dynamic_body_mass() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 0.0,
                    "y": 0.0,
                    "radius": 0.24,
                    "mass": -13.8,
                    "locked": false
                }
            ],
            "constraints": [],
            "forceSources": [
                {
                    "id": "gravity-1",
                    "kind": "gravity",
                    "acceleration": { "x": 0.0, "y": 9.8 }
                }
            ],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("runtime compile request should deserialize");

    let compiled = request
        .into_compiled_scene()
        .expect("runtime payload should compile after mass normalization");

    let ball = compiled
        .entities
        .iter()
        .find(|entity| entity.id == "ball-1")
        .expect("ball should compile");
    assert_eq!(ball.mass, 1.0);
}

#[test]
fn runtime_compile_validation_accepts_arc_track_entities_with_sweep_angle_payload() {
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
                },
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "anchorEntityId": "poly-1",
                    "anchorEntityKind": "block",
                    "anchorEndpoint": "start",
                    "center": { "x": 0.0, "y": 2.0 },
                    "entryEndpoint": "start",
                    "radius": 3.0,
                    "sweepAngleDegrees": 135.0,
                    "rotationDegrees": 180.0
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
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("arc-track entity payload should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("arc-track sweep-angle payload should compile through the bridge");

    assert_eq!(frame.frame_number, 0);
    assert!(
        frame
            .entities
            .iter()
            .any(|entity| entity.entity_id == "poly-1")
    );
    assert_eq!(frame.entities.len(), 1);
}

#[test]
fn runtime_compile_validation_accepts_legacy_arc_track_entities_with_central_angle() {
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
                },
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "center": { "x": 0.0, "y": 2.0 },
                    "radius": 3.0,
                    "centralAngleDegrees": 135.0,
                    "rotationDegrees": 180.0,
                    "thickness": 0.18
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
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("legacy arc-track entity payload should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("legacy arc-track entity payload should still compile through the bridge");

    assert_eq!(frame.frame_number, 0);
    assert!(
        frame
            .entities
            .iter()
            .any(|entity| entity.entity_id == "poly-1")
    );
}

#[test]
fn runtime_compile_validation_preserves_anchored_arc_track_handoff_metadata() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "board-1",
                    "kind": "board",
                    "x": 0.0,
                    "y": 0.0,
                    "width": 4.0,
                    "height": 0.5,
                    "locked": true
                },
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "anchorEntityId": "board-1",
                    "anchorEntityKind": "board",
                    "anchorEndpoint": "end",
                    "center": { "x": 4.0, "y": 0.5 },
                    "entryEndpoint": "start",
                    "radius": 1.5,
                    "sweepAngleDegrees": 90.0,
                    "rotationDegrees": 180.0
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
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("anchored arc-track payload should deserialize");

    let compiled = request
        .into_compiled_scene()
        .expect("anchored arc-track payload should compile");

    assert_eq!(compiled.arc_tracks.len(), 1);
    assert_eq!(
        compiled.arc_tracks[0].capture_policy,
        ArcTrackCapturePolicy::Start
    );
    assert_eq!(
        compiled.arc_tracks[0].anchor,
        Some(CompiledArcTrackAnchor {
            entity_id: "board-1".to_string(),
            entity_kind: ArcTrackAnchorEntityKind::Board,
            endpoint: ArcTrackAnchorEndpoint::End,
        })
    );
}

#[test]
fn runtime_compile_validation_applies_board_only_default_friction_policy() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "board-1",
                    "kind": "board",
                    "x": 0.0,
                    "y": 0.0,
                    "width": 4.0,
                    "height": 0.5,
                    "locked": true
                },
                {
                    "id": "ball-1",
                    "kind": "ball",
                    "x": 1.0,
                    "y": 2.0,
                    "radius": 0.25
                },
                {
                    "id": "block-1",
                    "kind": "block",
                    "x": 2.0,
                    "y": 2.0,
                    "width": 0.5,
                    "height": 0.5
                },
                {
                    "id": "polygon-1",
                    "kind": "polygon",
                    "x": 3.0,
                    "y": 2.0,
                    "width": 0.5,
                    "height": 0.5
                },
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "center": { "x": 4.0, "y": 2.0 },
                    "radius": 0.5,
                    "centralAngleDegrees": 120.0,
                    "rotationDegrees": 180.0,
                    "thickness": 0.14
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
    .expect("default-friction payload should deserialize");

    let compile_request = request
        .into_compile_scene_request()
        .expect("default-friction payload should convert");

    let friction_by_entity_id = compile_request
        .entities
        .into_iter()
        .map(|entity| (entity.id, entity.friction_coefficient))
        .collect::<std::collections::HashMap<_, _>>();

    assert_eq!(friction_by_entity_id.get("board-1"), Some(&0.2));
    assert_eq!(friction_by_entity_id.get("ball-1"), Some(&0.0));
    assert_eq!(friction_by_entity_id.get("block-1"), Some(&0.0));
    assert_eq!(friction_by_entity_id.get("polygon-1"), Some(&0.0));
    assert_eq!(friction_by_entity_id.get("arc-track-1"), Some(&0.0));
}

#[test]
fn runtime_compile_validation_flags_arc_track_shaped_ball_payloads_as_arc_tracks() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "arc-track-1",
                    "kind": "ball",
                    "x": 0.0,
                    "y": 0.0,
                    "anchorEntityId": "board-1",
                    "anchorEntityKind": "board",
                    "anchorEndpoint": "start",
                    "entryEndpoint": "start",
                    "radius": 3.0,
                    "sweepAngleDegrees": 135.0
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
        "dirtyScopes": [],
        "rebuildRequired": false
    }))
    .expect("arc-track-like payload should deserialize");

    assert_eq!(
        SimulationBridge::new(1.0 / 60.0).compile_runtime_request(request),
        Err(BridgeError::EntityPayloadKindMismatch {
            id: "arc-track-1".to_string(),
            expected_kind: "arc-track".to_string(),
            actual_kind: "ball".to_string(),
        })
    );
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
