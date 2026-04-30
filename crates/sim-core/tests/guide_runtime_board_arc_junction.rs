use std::collections::HashMap;

use serde_json::json;
use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS, angle_radians_for_position,
    contact_path_radius,
};
use sim_core::bridge::RuntimeCompileRequest;
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::guide_runtime::RuntimeGuideState;
use sim_core::runtime::{RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene_with_arc_track_metadata};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn ball(id: &str, position: Vector2, radius: f64, initial_velocity: Vector2) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius },
        position,
        rotation_radians: 0.0,
        initial_velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.05,
        restitution_coefficient: 0.0,
    }
}

fn board(id: &str, center: Vector2, width: f64, height: f64) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block { width, height },
        position: center,
        rotation_radians: 0.0,
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: 0.05,
        restitution_coefficient: 0.0,
    }
}

fn arc_track_entity(
    id: &str,
    center: Vector2,
    radius: f64,
    central_angle_degrees: f64,
    rotation_degrees: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::ArcTrack {
            radius,
            central_angle_degrees,
            thickness: DEFAULT_ARC_TRACK_THICKNESS,
        },
        position: center,
        rotation_radians: rotation_degrees.to_radians(),
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: 0.0,
        restitution_coefficient: 0.0,
    }
}

fn board_endpoint_frame(
    center: Vector2,
    width: f64,
    height: f64,
    endpoint: ArcTrackAnchorEndpoint,
) -> (Vector2, Vector2, Vector2) {
    let axis_x = vector2(1.0, 0.0);
    let top_center = center.add(vector2(0.0, -height * 0.5));
    let half_width_offset = axis_x.scale(width * 0.5);
    let surface_normal = vector2(0.0, -1.0);

    match endpoint {
        ArcTrackAnchorEndpoint::Start => (
            top_center.sub(half_width_offset),
            axis_x.scale(-1.0),
            surface_normal,
        ),
        ArcTrackAnchorEndpoint::End => (top_center.add(half_width_offset), axis_x, surface_normal),
    }
}

fn anchored_arc_track_entity(
    id: &str,
    board_endpoint_position: Vector2,
    board_endpoint_tangent: Vector2,
    radius: f64,
    sweep_degrees: f64,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> EntityDefinition {
    let radial = match entry_endpoint {
        ArcTrackEntryEndpoint::Start => board_endpoint_tangent.perp(),
        ArcTrackEntryEndpoint::End => board_endpoint_tangent.perp().scale(-1.0),
    };
    let center = board_endpoint_position.sub(radial.scale(contact_path_radius(
        radius,
        DEFAULT_ARC_TRACK_THICKNESS,
        ArcTrackSide::Inside,
    )));
    let entry_angle_radians =
        angle_radians_for_position(radial).expect("radial should define angle");
    let start_angle_radians = match entry_endpoint {
        ArcTrackEntryEndpoint::Start => entry_angle_radians,
        ArcTrackEntryEndpoint::End => entry_angle_radians - sweep_degrees.to_radians(),
    };

    arc_track_entity(
        id,
        center,
        radius,
        sweep_degrees,
        start_angle_radians.to_degrees(),
    )
}

fn runtime_for_board_arc_scene(
    initial_ball_position: Vector2,
    initial_ball_velocity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let board_center = vector2(0.0, 0.0);
    let board_width = 4.0;
    let board_height = 0.5;
    let (endpoint_position, endpoint_tangent, _) = board_endpoint_frame(
        board_center,
        board_width,
        board_height,
        ArcTrackAnchorEndpoint::End,
    );
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        endpoint_position,
        endpoint_tangent,
        1.25,
        90.0,
        ArcTrackEntryEndpoint::End,
    );
    let compiled = compile_scene_with_arc_track_metadata(
        &CompileSceneRequest {
            entities: vec![
                ball("ball", initial_ball_position, 0.4, initial_ball_velocity),
                board("board", board_center, board_width, board_height),
                arc_track,
            ],
            constraints: vec![],
            force_sources: vec![ForceSourceDefinition::Gravity {
                id: "gravity".to_string(),
                acceleration: vector2(0.0, -9.81),
            }],
            analyzers: vec![],
        },
        &HashMap::from([(
            "arc-track".to_string(),
            ArcTrackEntityCompileMetadata {
                anchor: Some(CompiledArcTrackAnchor {
                    entity_id: "board".to_string(),
                    entity_kind: ArcTrackAnchorEntityKind::Board,
                    endpoint: ArcTrackAnchorEndpoint::End,
                }),
                entry_endpoint: Some(ArcTrackEntryEndpoint::End),
            },
        )]),
    )
    .expect("scene should compile");

    RuntimeScene::new(compiled, fixed_delta_seconds)
}

fn run_steps(runtime: &mut RuntimeScene, steps: usize) {
    for _ in 0..steps {
        runtime.step();
    }
}

fn payload_frame<'a>(
    frame: &'a RuntimeFramePayload,
    entity_id: &str,
) -> &'a sim_core::runtime::RuntimeEntityFrame {
    frame
        .entities
        .iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist in frame")
}

fn runtime_from_desktop_payload(
    payload: serde_json::Value,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let request: RuntimeCompileRequest =
        serde_json::from_value(payload).expect("desktop runtime payload should deserialize");
    let compiled = request
        .into_compiled_scene()
        .expect("desktop runtime payload should compile");

    RuntimeScene::new(compiled, fixed_delta_seconds)
}

#[test]
fn guide_runtime_board_top_hands_off_to_connected_arc_segment() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.25, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(1.6),
        0.025,
    );

    run_steps(&mut runtime, 28);

    match runtime.guide_state("ball") {
        RuntimeGuideState::OnGuide {
            segment_id,
            progress,
            speed,
        } => {
            assert_eq!(segment_id, "guide:arc-track:arc");
            assert!(
                progress < 90.0_f64.to_radians(),
                "arc angle progress should remain within the authored span after end-entry handoff"
            );
            assert!(
                speed < 0.0,
                "positive board velocity should enter from the arc end"
            );
        }
        RuntimeGuideState::Free => panic!("ball should be on the connected arc guide"),
    }
}

#[test]
fn guide_runtime_board_to_arc_handoff_starts_at_junction_before_advancing_arc() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.95, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(10.0),
        0.1,
    );

    let frame = runtime.step();
    let expected_junction = vector2(2.0, -0.25).add(surface_normal.scale(0.4));
    let ball_frame = payload_frame(&frame, "ball");

    assert!(
        ball_frame.position.sub(expected_junction).length() < 1e-6,
        "first visible arc frame should render at the board-arc junction, got position=({:.6}, {:.6}) expected=({:.6}, {:.6})",
        ball_frame.position.x,
        ball_frame.position.y,
        expected_junction.x,
        expected_junction.y,
    );

    match runtime.guide_state("ball") {
        RuntimeGuideState::OnGuide {
            segment_id,
            progress,
            ..
        } => {
            assert_eq!(segment_id, "guide:arc-track:arc");
            assert!(
                (progress - 90.0_f64.to_radians()).abs() < 1e-6,
                "first arc frame should land at the board-arc junction before advancing along the arc, progress={progress:.6}"
            );
        }
        RuntimeGuideState::Free => panic!("ball should hand off to the connected arc guide"),
    }
}

#[test]
fn guide_runtime_desktop_payload_arc_radius_handoff_starts_at_junction() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball",
                        "kind": "ball",
                        "x": 3.55,
                        "y": -0.8,
                        "radius": 0.4,
                        "velocityX": 10.0,
                        "velocityY": 0.0,
                        "mass": 1.0,
                        "friction": 0.0,
                        "restitution": 0.0,
                        "locked": false
                    },
                    {
                        "id": "board",
                        "kind": "board",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 4.0,
                        "height": 0.5,
                        "locked": true,
                        "friction": 0.0
                    },
                    {
                        "id": "arc-track",
                        "kind": "arc-track",
                        "anchorEntityId": "board",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.0, "y": 1.25 },
                        "entryEndpoint": "end",
                        "radius": 1.25,
                        "sweepAngleDegrees": 90.0,
                        "rotationDegrees": 45.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": -9.81 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        0.1,
    );

    let frame = runtime.step();
    let ball_frame = payload_frame(&frame, "ball");
    let expected_junction_center = vector2(4.0, -0.4);

    assert!(
        ball_frame.position.sub(expected_junction_center).length() < 1e-6,
        "desktop payload handoff should render at the board-arc junction, got position=({:.6}, {:.6}) expected=({:.6}, {:.6})",
        ball_frame.position.x,
        ball_frame.position.y,
        expected_junction_center.x,
        expected_junction_center.y,
    );
}

#[test]
fn guide_runtime_desktop_payload_board_to_arc_handoff_has_no_large_frame_delta() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball",
                        "kind": "ball",
                        "x": 3.1,
                        "y": -0.8,
                        "radius": 0.4,
                        "velocityX": 1.2,
                        "velocityY": 0.0,
                        "mass": 1.0,
                        "friction": 0.0,
                        "restitution": 0.0,
                        "locked": false
                    },
                    {
                        "id": "board",
                        "kind": "board",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 4.0,
                        "height": 0.5,
                        "locked": true,
                        "friction": 0.0
                    },
                    {
                        "id": "arc-track",
                        "kind": "arc-track",
                        "anchorEntityId": "board",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.0, "y": 1.25 },
                        "entryEndpoint": "end",
                        "radius": 1.25,
                        "sweepAngleDegrees": 90.0,
                        "rotationDegrees": 45.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": -9.81 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        1.0 / 60.0,
    );
    let mut previous_frame = runtime.current_frame();

    for _ in 0..120 {
        let frame = runtime.step();
        let previous_ball = payload_frame(&previous_frame, "ball");
        let ball = payload_frame(&frame, "ball");

        if matches!(
            runtime.guide_state("ball"),
            RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:arc-track:arc"
        ) {
            let frame_delta = ball.position.sub(previous_ball.position).length();

            assert!(
                frame_delta < 0.08,
                "desktop payload should not skip across the board-arc junction in one visible frame, delta={frame_delta:.6} previous=({:.6}, {:.6}) current=({:.6}, {:.6})",
                previous_ball.position.x,
                previous_ball.position.y,
                ball.position.x,
                ball.position.y,
            );
            return;
        }

        previous_frame = frame;
    }

    panic!("desktop payload ball should enter the arc guide");
}

#[test]
fn guide_runtime_board_attached_ball_collides_with_free_ball_on_same_board() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball-1",
                        "kind": "ball",
                        "x": 1.73,
                        "y": 2.24,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 2.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "board-1",
                        "kind": "board",
                        "x": 1.61,
                        "y": 2.72,
                        "width": 3.2,
                        "height": 0.18,
                        "mass": 5.0,
                        "friction": 0.1,
                        "restitution": 1.0,
                        "locked": true,
                        "rotationRadians": 0.0,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "arc-track-1",
                        "kind": "arc-track",
                        "anchorEntityId": "board-1",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.81, "y": 1.72 },
                        "entryEndpoint": "start",
                        "radius": 1.0,
                        "rotationDegrees": -45.0,
                        "sweepAngleDegrees": 90.0,
                        "thickness": 0.18
                    },
                    {
                        "id": "ball-2",
                        "kind": "ball",
                        "x": 2.57,
                        "y": 2.24,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-primary",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": 9.8 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        1.0 / 60.0,
    );

    let combined_radius = 0.48;
    let mut min_distance = f64::INFINITY;
    let mut max_ball_2_velocity_x = 0.0;
    let mut saw_ball_1_on_board_guide = false;

    for _ in 0..40 {
        let frame = runtime.step();
        let ball_1 = payload_frame(&frame, "ball-1");
        let ball_2 = payload_frame(&frame, "ball-2");
        min_distance = min_distance.min(ball_1.position.sub(ball_2.position).length());
        max_ball_2_velocity_x = f64::max(max_ball_2_velocity_x, ball_2.velocity.x);
        saw_ball_1_on_board_guide |= matches!(
            runtime.guide_state("ball-1"),
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if segment_id == "guide:board-1:top"
        );
    }

    assert!(
        saw_ball_1_on_board_guide,
        "the moving ball should be constrained to the board guide before impact"
    );
    assert!(
        min_distance >= combined_radius - 1e-6,
        "guided and free balls should not interpenetrate, min_distance={min_distance:.6}"
    );
    assert!(
        max_ball_2_velocity_x > 0.5,
        "the stationary ball should receive a horizontal collision impulse, max_ball_2_velocity_x={max_ball_2_velocity_x:.6}"
    );
}

#[test]
fn guide_runtime_attached_ball_collision_updates_guide_speed_instead_of_linking() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball-1",
                        "kind": "ball",
                        "x": 1.4,
                        "y": 2.26,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 3.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "board-1",
                        "kind": "board",
                        "x": 1.05,
                        "y": 2.74,
                        "width": 3.2,
                        "height": 0.18,
                        "mass": 5.0,
                        "friction": 0.42,
                        "restitution": 1.0,
                        "locked": true,
                        "rotationRadians": 0.0,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "ball-2",
                        "kind": "ball",
                        "x": 2.12,
                        "y": 2.26,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "arc-track-1",
                        "kind": "arc-track",
                        "anchorEntityId": "board-1",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.25, "y": 1.74 },
                        "entryEndpoint": "start",
                        "radius": 1.0,
                        "rotationDegrees": -45.0,
                        "sweepAngleDegrees": 90.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-primary",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": 9.8 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        1.0 / 60.0,
    );

    let combined_radius = 0.48;

    for _ in 0..12 {
        let frame = runtime.step();
        let ball_1 = payload_frame(&frame, "ball-1");
        let ball_2 = payload_frame(&frame, "ball-2");
        let center_distance = ball_1.position.sub(ball_2.position).length();

        if ball_2.velocity.x > 1.0 {
            let ball_1_guide_speed = match runtime.guide_state("ball-1") {
                RuntimeGuideState::OnGuide { speed, .. } => speed,
                RuntimeGuideState::Free => ball_1.velocity.x,
            };

            assert!(
                center_distance >= combined_radius - 1e-6,
                "colliding balls should remain separated, center_distance={center_distance:.6}"
            );
            assert!(
                ball_1.velocity.x.abs() < 0.5,
                "the guided striker should lose forward velocity instead of linking, ball_1_vx={:.6}",
                ball_1.velocity.x
            );
            assert!(
                ball_1_guide_speed.abs() < 0.5,
                "the guide attachment speed should be updated by collision impulse, speed={ball_1_guide_speed:.6}"
            );
            assert!(
                ball_2.velocity.x > 2.0,
                "the struck ball should carry the forward collision velocity, ball_2_vx={:.6}",
                ball_2.velocity.x
            );
            return;
        }
    }

    panic!("the trace fixture should collide within the first few frames");
}

#[test]
fn guide_runtime_attached_balls_collide_when_returning_on_same_guide() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball-1",
                        "kind": "ball",
                        "x": 1.02,
                        "y": 1.49,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 3.8,
                        "velocityY": 0.0
                    },
                    {
                        "id": "board-1",
                        "kind": "board",
                        "x": 0.96,
                        "y": 1.97,
                        "width": 3.2,
                        "height": 0.18,
                        "mass": 5.0,
                        "friction": 0.42,
                        "restitution": 1.0,
                        "locked": true,
                        "rotationRadians": 0.0,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "ball-2",
                        "kind": "ball",
                        "x": 1.68,
                        "y": 1.49,
                        "radius": 0.24,
                        "mass": 1.2,
                        "friction": 0.0,
                        "restitution": 1.0,
                        "locked": false,
                        "velocityX": 0.0,
                        "velocityY": 0.0
                    },
                    {
                        "id": "arc-track-1",
                        "kind": "arc-track",
                        "anchorEntityId": "board-1",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.16, "y": 0.97 },
                        "entryEndpoint": "start",
                        "radius": 1.0,
                        "rotationDegrees": -45.0,
                        "sweepAngleDegrees": 90.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity-primary",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": 9.8 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        1.0 / 60.0,
    );

    let combined_radius = 0.48;
    let mut min_return_distance = f64::INFINITY;
    let mut saw_returning_phase = false;
    let mut saw_return_collision = false;

    for _ in 0..170 {
        let frame = runtime.step();
        let ball_1 = payload_frame(&frame, "ball-1");
        let ball_2 = payload_frame(&frame, "ball-2");

        if frame.frame_number > 60 && ball_2.velocity.x < -1.0 {
            saw_returning_phase = true;
        }

        if saw_returning_phase {
            min_return_distance =
                min_return_distance.min(ball_1.position.sub(ball_2.position).length());
            saw_return_collision |= ball_1.velocity.x < -1.0 && ball_2.velocity.x.abs() < 1.0;
        }
    }

    assert!(
        saw_returning_phase,
        "the fixture should bring ball-2 back toward ball-1 on the guide"
    );
    assert!(
        min_return_distance >= combined_radius - 1e-6,
        "attached balls should collide instead of passing through each other, min_return_distance={min_return_distance:.6}"
    );
    assert!(
        saw_return_collision,
        "returning ball-2 should transfer its guide velocity to ball-1 instead of passing through"
    );
}

#[test]
fn guide_runtime_desktop_payload_arc_to_board_handoff_has_no_large_frame_delta() {
    let mut runtime = runtime_from_desktop_payload(
        json!({
            "scene": {
                "schemaVersion": 1,
                "entities": [
                    {
                        "id": "ball",
                        "kind": "ball",
                        "x": 2.85,
                        "y": -0.8,
                        "radius": 0.4,
                        "velocityX": 0.8,
                        "velocityY": 0.0,
                        "mass": 1.0,
                        "friction": 0.0,
                        "restitution": 0.0,
                        "locked": false
                    },
                    {
                        "id": "board",
                        "kind": "board",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 4.0,
                        "height": 0.5,
                        "locked": true,
                        "friction": 0.0
                    },
                    {
                        "id": "arc-track",
                        "kind": "arc-track",
                        "anchorEntityId": "board",
                        "anchorEntityKind": "board",
                        "anchorEndpoint": "end",
                        "center": { "x": 4.0, "y": 1.25 },
                        "entryEndpoint": "end",
                        "radius": 1.25,
                        "sweepAngleDegrees": 90.0,
                        "rotationDegrees": 45.0,
                        "thickness": 0.18
                    }
                ],
                "constraints": [],
                "forceSources": [
                    {
                        "id": "gravity",
                        "kind": "gravity",
                        "acceleration": { "x": 0.0, "y": -9.81 }
                    }
                ],
                "analyzers": [],
                "annotations": []
            },
            "dirtyScopes": [],
            "rebuildRequired": false
        }),
        1.0 / 60.0,
    );
    let mut previous_frame = runtime.current_frame();
    let mut saw_arc = false;

    for _ in 0..240 {
        let frame = runtime.step();
        let previous_ball = payload_frame(&previous_frame, "ball");
        let ball = payload_frame(&frame, "ball");

        match runtime.guide_state("ball") {
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if segment_id == "guide:arc-track:arc" =>
            {
                saw_arc = true;
            }
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if saw_arc && segment_id == "guide:board:top" =>
            {
                let frame_delta = ball.position.sub(previous_ball.position).length();

                assert!(
                    frame_delta < 0.08,
                    "desktop payload should not jump from the arc back to the board junction in one visible frame, delta={frame_delta:.6} previous=({:.6}, {:.6}) current=({:.6}, {:.6})",
                    previous_ball.position.x,
                    previous_ball.position.y,
                    ball.position.x,
                    ball.position.y,
                );
                return;
            }
            RuntimeGuideState::Free if saw_arc => {
                panic!("desktop payload should return from arc to board without detaching");
            }
            RuntimeGuideState::Free | RuntimeGuideState::OnGuide { .. } => {}
        }

        previous_frame = frame;
    }

    panic!("desktop payload ball should return from the arc guide to the board guide");
}

#[test]
fn guide_runtime_wrong_direction_does_not_handoff_to_arc_segment() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.9, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(-1.0),
        0.025,
    );

    run_steps(&mut runtime, 20);

    match runtime.guide_state("ball") {
        RuntimeGuideState::OnGuide { segment_id, .. } => {
            assert_ne!(segment_id, "guide:arc-track:arc");
        }
        RuntimeGuideState::Free => {}
    }
}

#[test]
fn guide_runtime_free_ball_moving_away_from_board_does_not_snap_to_board_guide() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let initial_position = vector2(1.0, -0.25).add(surface_normal.scale(0.4));
    let initial_velocity = tangent.scale(0.6).add(surface_normal.scale(0.8));
    let mut runtime = runtime_for_board_arc_scene(initial_position, initial_velocity, 0.025);

    runtime.step();

    assert!(
        matches!(runtime.guide_state("ball"), RuntimeGuideState::Free),
        "ball moving away from the board should remain free instead of being projected onto the board guide"
    );
}

#[test]
fn guide_runtime_board_arc_handoff_result_is_substep_invariant() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let initial_position = vector2(1.25, -0.25).add(surface_normal.scale(0.4));
    let initial_velocity = tangent.scale(1.6);

    let mut coarse_runtime = runtime_for_board_arc_scene(initial_position, initial_velocity, 0.05);
    let mut fine_runtime = runtime_for_board_arc_scene(initial_position, initial_velocity, 0.0125);

    run_steps(&mut coarse_runtime, 14);
    run_steps(&mut fine_runtime, 56);

    assert!(matches!(
        coarse_runtime.guide_state("ball"),
        RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:arc-track:arc"
    ));
    assert!(matches!(
        fine_runtime.guide_state("ball"),
        RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:arc-track:arc"
    ));
}

#[test]
fn guide_runtime_terminal_zone_handoff_does_not_pre_switch_before_reaching_the_junction() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.985, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(0.2),
        0.025,
    );

    runtime.step();

    assert!(
        matches!(
            runtime.guide_state("ball"),
            RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:board:top"
        ),
        "terminal-zone logic should not pre-switch to the arc while the ball is still visibly short of the board endpoint"
    );
}

#[test]
fn guide_runtime_arc_turning_point_reverses_back_to_board_without_detaching() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.25, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(0.8),
        0.025,
    );

    let mut saw_arc_guide = false;
    let mut saw_free_after_arc = false;
    let mut returned_to_board = false;

    for _ in 0..120 {
        runtime.step();

        match runtime.guide_state("ball") {
            RuntimeGuideState::OnGuide {
                ref segment_id,
                speed,
                ..
            } if segment_id == "guide:arc-track:arc" => {
                saw_arc_guide = true;
                if speed < 0.0 {
                    returned_to_board = false;
                }
            }
            RuntimeGuideState::OnGuide {
                ref segment_id,
                speed,
                ..
            } if saw_arc_guide && segment_id == "guide:board:top" && speed < 0.0 => {
                returned_to_board = true;
                break;
            }
            RuntimeGuideState::Free if saw_arc_guide => {
                saw_free_after_arc = true;
                break;
            }
            RuntimeGuideState::Free | RuntimeGuideState::OnGuide { .. } => {}
        }
    }

    assert!(
        saw_arc_guide,
        "ball should first enter the connected arc guide before reaching its turning point"
    );
    assert!(
        !saw_free_after_arc,
        "turning-point reversal should stay shell-supported instead of detaching into free flight"
    );
    assert!(
        returned_to_board,
        "ball should reverse along the rail and hand back to the board guide after slowing to zero"
    );
}

#[test]
fn guide_runtime_arc_to_board_handoff_starts_at_junction_before_advancing_board() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.25, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(0.8),
        0.025,
    );
    let expected_junction = vector2(2.0, -0.25).add(surface_normal.scale(0.4));
    let mut saw_arc_guide = false;

    for _ in 0..120 {
        let frame = runtime.step();

        match runtime.guide_state("ball") {
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if segment_id == "guide:arc-track:arc" =>
            {
                saw_arc_guide = true;
            }
            RuntimeGuideState::OnGuide {
                ref segment_id,
                progress,
                ..
            } if saw_arc_guide && segment_id == "guide:board:top" => {
                let ball_frame = payload_frame(&frame, "ball");

                assert!(
                    ball_frame.position.sub(expected_junction).length() < 1e-6,
                    "first visible board frame should render at the arc-board junction, got position=({:.6}, {:.6}) expected=({:.6}, {:.6})",
                    ball_frame.position.x,
                    ball_frame.position.y,
                    expected_junction.x,
                    expected_junction.y,
                );
                assert!(
                    (progress - 4.0).abs() < 1e-6,
                    "first board frame should land at the arc-board junction before advancing along the board, progress={progress:.6}"
                );
                return;
            }
            RuntimeGuideState::Free if saw_arc_guide => {
                panic!("turning-point reversal should return to the board guide");
            }
            RuntimeGuideState::Free | RuntimeGuideState::OnGuide { .. } => {}
        }
    }

    panic!("ball should return from the arc guide to the board guide");
}

#[test]
fn guide_runtime_arc_return_to_same_board_preserves_entry_speed() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let initial_speed: f64 = 2.0;
    let mut runtime = runtime_for_board_arc_scene(
        vector2(1.25, -0.25).add(surface_normal.scale(0.4)),
        tangent.scale(initial_speed),
        1.0 / 60.0,
    );
    let mut saw_arc_guide = false;

    for _ in 0..180 {
        let frame = runtime.step();
        let ball = payload_frame(&frame, "ball");

        match runtime.guide_state("ball") {
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if segment_id == "guide:arc-track:arc" =>
            {
                saw_arc_guide = true;
            }
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if saw_arc_guide && segment_id == "guide:board:top" =>
            {
                let returned_speed = ball.velocity.length();

                assert!(
                    (returned_speed - initial_speed).abs() < 0.005,
                    "ball returning to the same board height should preserve speed; initial={initial_speed:.6} returned={returned_speed:.6} frame={}",
                    frame.frame_number
                );
                return;
            }
            RuntimeGuideState::Free if saw_arc_guide => {
                panic!("ball should return to the board guide instead of detaching");
            }
            RuntimeGuideState::Free | RuntimeGuideState::OnGuide { .. } => {}
        }
    }

    panic!("ball should return from the arc guide to the board guide");
}
