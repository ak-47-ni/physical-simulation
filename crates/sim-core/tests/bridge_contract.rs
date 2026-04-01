use serde_json::json;
use sim_core::bridge::{
    BridgeBlockReason, BridgeError, BridgeStatus, DirtyEditScope, RuntimeCompileRequest,
    SimulationBridge,
};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::scene::{CompileSceneRequest, SceneCompileError};

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
        analyzers: vec![],
    }
}

#[test]
fn bridge_contract_accepts_compile_scene_command() {
    let mut bridge = SimulationBridge::new(0.1);

    let frame = bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    assert_eq!(frame.frame_number, 0);
    assert_eq!(frame.entities.len(), 1);
    assert_eq!(frame.entities[0].entity_id, "block-1");
}

#[test]
fn bridge_contract_step_returns_runtime_frame_payload() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    let frame = bridge.step().expect("step should return a frame payload");

    assert_eq!(frame.frame_number, 1);
    assert!(frame.entities[0].position.x > 0.0);
}

#[test]
fn bridge_contract_reset_rebuilds_from_compile_baseline() {
    let mut bridge = SimulationBridge::new(0.1);
    let baseline = bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    bridge.step().expect("first step should succeed");
    bridge.step().expect("second step should succeed");
    let reset_frame = bridge.reset().expect("reset should rebuild from baseline");

    assert_eq!(reset_frame, baseline);
}

#[test]
fn bridge_contract_dirty_scene_blocks_resume_until_rebuild() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    bridge.mark_dirty();

    assert_eq!(
        bridge.start_or_resume(),
        Err(BridgeError::DirtySceneRequiresRebuild)
    );

    bridge
        .compile_scene(runtime_scene_request())
        .expect("recompile should clear dirty state");

    assert!(bridge.start_or_resume().is_ok());
}

#[test]
fn bridge_contract_snapshot_controls_report_runtime_state_transitions() {
    let mut bridge = SimulationBridge::new(0.1);

    let compiled = bridge
        .compile_scene_snapshot(runtime_scene_request())
        .expect("scene should compile into an idle snapshot");
    assert_eq!(compiled.status, BridgeStatus::Idle);
    assert_eq!(
        compiled
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(0)
    );

    let running = bridge
        .start_or_resume_snapshot()
        .expect("start should return a running snapshot");
    assert_eq!(running.status, BridgeStatus::Running);
    assert!(running.can_resume);

    let stepped = bridge
        .step_snapshot()
        .expect("step should return a stepped snapshot");
    assert_eq!(stepped.status, BridgeStatus::Running);
    assert_eq!(
        stepped
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(1)
    );
    assert!(stepped.current_time_seconds > 0.0);

    let paused = bridge
        .pause_snapshot()
        .expect("pause should return a paused snapshot");
    assert_eq!(paused.status, BridgeStatus::Paused);
    assert_eq!(
        paused
            .current_frame
            .as_ref()
            .map(|frame| frame.frame_number),
        Some(1)
    );

    let reset = bridge
        .reset_snapshot()
        .expect("reset should return a reset snapshot");
    assert_eq!(reset.status, BridgeStatus::Idle);
    assert_eq!(reset.current_time_seconds, 0.0);
    assert_eq!(
        reset.current_frame.as_ref().map(|frame| frame.frame_number),
        Some(0)
    );
}

#[test]
fn bridge_contract_accepts_typed_constraint_runtime_payloads() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "anchor",
                    "kind": "board",
                    "x": -8.0,
                    "y": -8.0,
                    "width": 16.0,
                    "height": 16.0,
                    "locked": true
                },
                {
                    "id": "payload",
                    "kind": "ball",
                    "x": 96.0,
                    "y": 24.0,
                    "radius": 12.0
                }
            ],
            "constraints": [
                {
                    "id": "spring-1",
                    "kind": "spring",
                    "entityAId": "anchor",
                    "entityBId": "payload",
                    "restLength": 120.0,
                    "stiffness": 18.0
                },
                {
                    "id": "arc-track-1",
                    "kind": "arc-track",
                    "center": { "x": 96.0, "y": 72.0 },
                    "radius": 48.0,
                    "startAngleDegrees": 210.0,
                    "endAngleDegrees": 330.0,
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
    .expect("typed runtime compile request should deserialize");

    let frame = SimulationBridge::new(0.1)
        .compile_runtime_request(request)
        .expect("typed constraints and gravity should compile");

    assert_eq!(frame.frame_number, 0);
    assert_eq!(frame.entities.len(), 2);
}

#[test]
fn bridge_contract_invalid_constraint_payloads_return_readable_scene_errors() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "anchor",
                    "kind": "board",
                    "x": -8.0,
                    "y": -8.0,
                    "width": 16.0,
                    "height": 16.0,
                    "locked": true
                },
                {
                    "id": "payload",
                    "kind": "ball",
                    "x": 96.0,
                    "y": 24.0,
                    "radius": 12.0
                }
            ],
            "constraints": [
                {
                    "id": "spring-1",
                    "kind": "spring",
                    "entityAId": "anchor",
                    "entityBId": "payload",
                    "restLength": 0.0,
                    "stiffness": 18.0
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
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("typed runtime compile request should deserialize");

    assert_eq!(
        SimulationBridge::new(0.1).compile_runtime_request(request),
        Err(BridgeError::SceneCompile(
            SceneCompileError::InvalidSpringRestLength {
                constraint_id: "spring-1".to_string(),
                value: 0.0,
            }
        ))
    );
}

#[test]
fn bridge_contract_status_snapshot_reports_rebuild_block_after_dirty_edits() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    let snapshot = bridge.mark_dirty_scopes(&[DirtyEditScope::Physics]);

    assert_eq!(snapshot.status, BridgeStatus::Paused);
    assert!(snapshot.rebuild_required);
    assert!(!snapshot.can_resume);
    assert_eq!(
        snapshot.block_reason,
        Some(BridgeBlockReason::RebuildRequired)
    );
}

#[test]
fn bridge_contract_unknown_trajectory_reads_return_stable_errors() {
    let mut bridge = SimulationBridge::new(0.1);
    bridge
        .compile_scene(runtime_scene_request())
        .expect("scene should compile into a bridge runtime");

    assert_eq!(
        bridge.read_trajectory_samples("missing-analyzer"),
        Err(BridgeError::UnknownAnalyzer {
            id: "missing-analyzer".to_string(),
        })
    );
}
