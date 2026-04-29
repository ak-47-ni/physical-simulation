use std::collections::HashMap;

use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS, angle_radians_for_position,
    contact_path_radius, effective_center_radius, endpoint_geometry,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene, compile_scene_with_arc_track_metadata};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn ball(id: &str, position: Vector2, velocity: Vector2) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius: 0.5 },
        position,
        rotation_radians: 0.0,
        initial_velocity: velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.2,
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

#[derive(Debug, Clone, Copy)]
struct AnchorEndpointFrame {
    position: Vector2,
    tangent: Vector2,
    surface_normal: Vector2,
}

fn block(
    id: &str,
    center: Vector2,
    width: f64,
    height: f64,
    rotation_degrees: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block { width, height },
        position: center,
        rotation_radians: rotation_degrees.to_radians(),
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: 0.2,
        restitution_coefficient: 0.0,
    }
}

fn block_anchor_endpoint_frame(
    center: Vector2,
    width: f64,
    height: f64,
    rotation_degrees: f64,
    endpoint: ArcTrackAnchorEndpoint,
) -> AnchorEndpointFrame {
    let axis_x = vector2(1.0, 0.0).rotated(rotation_degrees.to_radians());
    let axis_y = axis_x.perp();
    let top_center = center.add(axis_y.scale(-height * 0.5));
    let half_width_offset = axis_x.scale(width * 0.5);
    let surface_normal = axis_y.scale(-1.0);
    let (position, tangent) = match endpoint {
        ArcTrackAnchorEndpoint::Start => (top_center.sub(half_width_offset), axis_x.scale(-1.0)),
        ArcTrackAnchorEndpoint::End => (top_center.add(half_width_offset), axis_x),
    };

    AnchorEndpointFrame {
        position,
        tangent,
        surface_normal,
    }
}

fn anchored_arc_track_entity(
    id: &str,
    anchor_frame: AnchorEndpointFrame,
    radius: f64,
    sweep_degrees: f64,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> EntityDefinition {
    let radial = match entry_endpoint {
        ArcTrackEntryEndpoint::Start => anchor_frame.tangent.perp(),
        ArcTrackEntryEndpoint::End => anchor_frame.tangent.perp().scale(-1.0),
    };
    let center = anchor_frame.position.sub(radial.scale(contact_path_radius(
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

fn local_tangent_crossing_ball(
    id: &str,
    anchor_frame: AnchorEndpointFrame,
    tangential_offset: f64,
    tangential_velocity: f64,
    normal_velocity: f64,
) -> EntityDefinition {
    ball(
        id,
        anchor_frame
            .position
            .add(anchor_frame.tangent.scale(tangential_offset))
            .add(anchor_frame.surface_normal.scale(0.5)),
        anchor_frame
            .tangent
            .scale(tangential_velocity)
            .add(anchor_frame.surface_normal.scale(normal_velocity)),
    )
}

fn runtime_for_scene(
    entity: EntityDefinition,
    constraint: ConstraintDefinition,
    gravity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities: vec![entity],
        constraints: vec![constraint],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: gravity,
        }],
        analyzers: vec![],
    })
    .expect("scene should compile");

    RuntimeScene::new(compiled, fixed_delta_seconds)
}

fn runtime_for_scene_with_arc_entity(
    entity: EntityDefinition,
    arc_track: EntityDefinition,
    gravity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities: vec![entity, arc_track],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: gravity,
        }],
        analyzers: vec![],
    })
    .expect("scene should compile");

    RuntimeScene::new(compiled, fixed_delta_seconds)
}

#[allow(clippy::too_many_arguments)]
fn runtime_for_scene_with_anchored_arc_entity(
    entity: EntityDefinition,
    anchor: EntityDefinition,
    anchor_kind: ArcTrackAnchorEntityKind,
    anchor_endpoint: ArcTrackAnchorEndpoint,
    arc_track: EntityDefinition,
    entry_endpoint: ArcTrackEntryEndpoint,
    gravity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let anchor_id = anchor.id.clone();
    let arc_track_id = arc_track.id.clone();
    let compiled = compile_scene_with_arc_track_metadata(
        &CompileSceneRequest {
            entities: vec![entity, anchor, arc_track],
            constraints: vec![],
            force_sources: vec![ForceSourceDefinition::Gravity {
                id: "gravity".to_string(),
                acceleration: gravity,
            }],
            analyzers: vec![],
        },
        &HashMap::from([(
            arc_track_id,
            ArcTrackEntityCompileMetadata {
                anchor: Some(CompiledArcTrackAnchor {
                    entity_id: anchor_id,
                    entity_kind: anchor_kind,
                    endpoint: anchor_endpoint,
                }),
                entry_endpoint: Some(entry_endpoint),
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

fn runtime_entity(runtime: &RuntimeScene, entity_id: &str) -> RuntimeEntityFrame {
    runtime
        .current_frame()
        .entities
        .into_iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist in frame")
}

fn entry_arc() -> ConstraintDefinition {
    ConstraintDefinition::ArcTrack {
        id: "arc-track".to_string(),
        center: vector2(4.0, 4.0),
        radius: 2.0,
        start_angle_degrees: 30.0,
        end_angle_degrees: 90.0,
        side: ArcTrackSide::Inside,
        entry_endpoint: ArcTrackEntryEndpoint::End,
    }
}

fn inside_effective_radius(radius: f64) -> f64 {
    effective_center_radius(
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        0.5,
        ArcTrackSide::Inside,
    )
}

fn free_arc_entry_center_path_position(
    center: Vector2,
    radius: f64,
    start_angle_degrees: f64,
    end_angle_degrees: f64,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> Vector2 {
    let endpoint = endpoint_geometry(
        center,
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        start_angle_degrees.to_radians(),
        end_angle_degrees.to_radians(),
        ArcTrackSide::Inside,
        entry_endpoint,
    );

    endpoint.position.add(endpoint.support_direction.scale(0.5))
}

#[test]
fn arc_entry_capture_regression_aligned_ball_enters_at_configured_endpoint() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let entry_center =
        free_arc_entry_center_path_position(center, 2.0, 30.0, 90.0, ArcTrackEntryEndpoint::End);
    let mut runtime = runtime_for_scene(
        ball(
            "ball",
            entry_center.sub(vector2(0.4, 0.0)),
            vector2(2.0, 0.0),
        ),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 6);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - expected_radius).abs() < 5e-2);
    assert!(frame.position.x > 4.0);
    assert!(frame.position.y > 2.0);
}

#[test]
fn arc_entry_capture_regression_wrong_direction_does_not_enter() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(5.0, 2.0), vector2(-2.0, 0.0)),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 4);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.x < 5.0);
    assert!((frame.position.y - 2.0).abs() < 1e-6);
    assert!((frame.position.sub(center).length() - expected_radius).abs() > 5e-2);
}

#[test]
fn arc_entry_capture_regression_distant_ball_does_not_enter() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(1.0, 2.0), vector2(2.0, 0.0)),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 3);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.x < 2.0);
    assert!((frame.position.y - 2.0).abs() < 1e-6);
    assert!((frame.position.sub(center).length() - expected_radius).abs() > 0.5);
}

#[test]
fn arc_entry_capture_regression_near_contact_endpoint_but_off_center_path_does_not_snap() {
    let center = vector2(4.0, 4.0);
    let endpoint = endpoint_geometry(
        center,
        contact_path_radius(2.0, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        30.0_f64.to_radians(),
        90.0_f64.to_radians(),
        ArcTrackSide::Inside,
        ArcTrackEntryEndpoint::End,
    );
    let initial_position = endpoint
        .position
        .sub(endpoint.tangent.scale(0.04))
        .add(endpoint.support_direction.scale(0.05));
    let initial_velocity = endpoint.tangent.scale(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", initial_position, initial_velocity),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    runtime.step();
    let frame = runtime_entity(&runtime, "ball");
    let expected_free_position = initial_position.add(initial_velocity.scale(0.05));
    let expected_radius = inside_effective_radius(2.0);

    assert!(
        frame.position.sub(expected_free_position).length() < 1e-6,
        "near-endpoint free flight should not be projected onto the arc, got position=({:.3}, {:.3}) expected=({:.3}, {:.3})",
        frame.position.x,
        frame.position.y,
        expected_free_position.x,
        expected_free_position.y,
    );
    assert!(
        (frame.position.sub(center).length() - expected_radius).abs() > 5e-2,
        "ball center was not on the arc center path and should not snap to it"
    );
}

#[test]
fn arc_entry_capture_regression_frontend_board_anchored_payload_enters_from_junction() {
    let center = vector2(8.0, 5.5);
    let expected_radius = inside_effective_radius(1.0);
    let entry_center =
        free_arc_entry_center_path_position(center, 1.0, 90.0, 270.0, ArcTrackEntryEndpoint::Start);
    let mut runtime = runtime_for_scene(
        ball(
            "ball",
            entry_center.add(vector2(0.4, 0.0)),
            vector2(-2.0, 0.0),
        ),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 1.0,
            start_angle_degrees: 90.0,
            end_angle_degrees: 270.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 12);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected board-anchored payload to stay on the arc, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
    assert!(frame.position.x < 8.0);
}

#[test]
fn arc_entry_capture_regression_arc_track_entity_captures_tangent_matched_endpoint() {
    let center = vector2(8.0, 5.5);
    let expected_radius = inside_effective_radius(1.0);
    let entry_center =
        free_arc_entry_center_path_position(center, 1.0, 90.0, 270.0, ArcTrackEntryEndpoint::Start);
    let mut runtime = runtime_for_scene_with_arc_entity(
        ball(
            "ball",
            entry_center.add(vector2(0.008, 0.0)),
            vector2(-0.2, 0.0),
        ),
        arc_track_entity("arc-track", center, 1.0, 180.0, 90.0),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected entity arc-track to capture at the tangent-matched endpoint, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
    assert!(frame.position.x < 8.2, "ball_x={}", frame.position.x);
    assert!(frame.velocity.x < 0.0, "ball_vx={}", frame.velocity.x);
}

#[test]
fn arc_entry_capture_regression_arc_track_entity_does_not_capture_mid_arc_pass() {
    let center = vector2(8.0, 5.5);
    let expected_radius = inside_effective_radius(1.0);
    let mut runtime = runtime_for_scene_with_arc_entity(
        ball("ball", vector2(7.1, 5.5), vector2(0.0, -0.2)),
        arc_track_entity("arc-track", center, 1.0, 180.0, 90.0),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() > 5e-2,
        "expected entity arc-track to avoid hidden mid-arc capture, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
    assert!(
        (frame.position.x - 7.1).abs() < 1e-6,
        "ball_x={}",
        frame.position.x
    );
    assert!(frame.position.y < 5.5, "ball_y={}", frame.position.y);
}

#[test]
fn arc_entry_capture_regression_block_anchored_entity_captures_board_endpoint_crossing() {
    let anchor_frame = block_anchor_endpoint_frame(
        vector2(2.0, 2.25),
        4.0,
        0.5,
        0.0,
        ArcTrackAnchorEndpoint::End,
    );
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        2.0,
        60.0,
        ArcTrackEntryEndpoint::End,
    );
    let center = arc_track.position;
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        ball("ball", vector2(3.6, 1.5), vector2(2.0, 0.0)),
        block("anchor", vector2(2.0, 2.25), 4.0, 0.5, 0.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::End,
        arc_track,
        ArcTrackEntryEndpoint::End,
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 8);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected block-anchored junction handoff to capture the board-supported ball, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
    assert!(frame.position.x > 4.0, "ball_x={}", frame.position.x);
    assert!(frame.position.y > 2.0, "ball_y={}", frame.position.y);
}

#[test]
fn arc_entry_capture_regression_block_anchored_entity_avoids_hidden_free_ball_capture() {
    let anchor_frame = block_anchor_endpoint_frame(
        vector2(2.0, 2.25),
        4.0,
        0.5,
        0.0,
        ArcTrackAnchorEndpoint::End,
    );
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        2.0,
        60.0,
        ArcTrackEntryEndpoint::End,
    );
    let center = arc_track.position;
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        ball("ball", vector2(4.05, 2.3), vector2(0.5, 0.0)),
        block("anchor", vector2(2.0, 2.25), 4.0, 0.5, 0.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::End,
        arc_track,
        ArcTrackEntryEndpoint::End,
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 2);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() > 5e-2,
        "expected anchored guide to reject hidden free-ball capture near the junction, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
    assert!(frame.position.x > 4.05, "ball_x={}", frame.position.x);
}

#[test]
fn arc_entry_capture_regression_rotated_block_uses_local_tangent_crossing_not_velocity_alignment() {
    let anchor_center = vector2(2.0, 2.0);
    let anchor_frame =
        block_anchor_endpoint_frame(anchor_center, 4.0, 0.5, 90.0, ArcTrackAnchorEndpoint::End);
    let initial_ball = local_tangent_crossing_ball("ball", anchor_frame, -0.02, 1.0, 0.9);
    let initial_x = initial_ball.position.x;
    let projected_x_after_step = initial_ball.position.x + initial_ball.initial_velocity.x * 0.05;
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        1.0,
        90.0,
        ArcTrackEntryEndpoint::End,
    );
    let arc_center = arc_track.position;
    let expected_radius = inside_effective_radius(1.0);
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        initial_ball,
        block("anchor", anchor_center, 4.0, 0.5, 90.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::End,
        arc_track,
        ArcTrackEntryEndpoint::End,
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(arc_center).length();

    assert!(
        projected_x_after_step > anchor_frame.position.x,
        "expected projected motion to stay on the same world-x side of the endpoint",
    );
    assert!(
        initial_x > anchor_frame.position.x && projected_x_after_step > anchor_frame.position.x,
        "expected local-tangent crossing setup to avoid any world-x crossing",
    );
    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected rotated support handoff to capture from local tangent crossing, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
}

#[test]
fn arc_entry_capture_regression_rotated_block_allows_small_local_tangent_overshoot_window() {
    let anchor_center = vector2(2.0, 2.0);
    let anchor_frame =
        block_anchor_endpoint_frame(anchor_center, 4.0, 0.5, 90.0, ArcTrackAnchorEndpoint::End);
    let initial_ball = local_tangent_crossing_ball("ball", anchor_frame, 0.08, 1.0, 0.9);
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        1.0,
        90.0,
        ArcTrackEntryEndpoint::End,
    );
    let arc_center = arc_track.position;
    let expected_radius = inside_effective_radius(1.0);
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        initial_ball,
        block("anchor", anchor_center, 4.0, 0.5, 90.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::End,
        arc_track,
        ArcTrackEntryEndpoint::End,
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let frame = runtime_entity(&runtime, "ball");
    let radial_distance = frame.position.sub(arc_center).length();

    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected rotated support handoff to allow a small post-endpoint overshoot window, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial_distance,
    );
}
