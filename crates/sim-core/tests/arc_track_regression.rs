use std::collections::HashMap;

use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS, angle_radians_for_position,
    contact_path_radius, effective_center_radius,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeFramePayload, RuntimeScene};
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

fn inside_effective_radius(radius: f64) -> f64 {
    effective_center_radius(
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        0.5,
        ArcTrackSide::Inside,
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

#[test]
fn arc_track_regression_bowl_segment_keeps_ball_attached() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(3.6, 2.0), vector2(2.0, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 30.0,
            end_angle_degrees: 90.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 10);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - expected_radius).abs() < 5e-2);
    assert!(frame.position.x > 4.0);
    assert!(frame.position.y > 2.0);
}

#[test]
fn arc_track_regression_detaches_when_support_would_need_to_pull() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(4.8, 6.0), vector2(-2.0, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 210.0,
            end_angle_degrees: 270.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        vector2(0.0, -9.81),
        0.05,
    );

    let first_frame = runtime.step();
    assert!(
        (payload_frame(&first_frame, "ball")
            .position
            .sub(center)
            .length()
            - expected_radius)
            .abs()
            < 5e-2
    );

    run_steps(&mut runtime, 5);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.y < 6.0 - 1e-3);
    assert!((frame.position.sub(center).length() - expected_radius).abs() > 5e-2);
}

#[test]
fn arc_track_regression_detaches_at_arc_end_and_continues_free_flight() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(3.7, 2.0), vector2(2.8, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 60.0,
            end_angle_degrees: 90.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 12);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - expected_radius).abs() > 5e-2);
    assert!(frame.velocity.x > 0.0);
}

#[test]
fn arc_track_regression_arc_track_entity_guides_ball_then_releases_tangentially() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene_with_arc_entity(
        ball("ball", vector2(3.7, 2.0), vector2(2.8, 0.0)),
        arc_track_entity("arc-track", center, 2.0, 30.0, 60.0),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let captured = runtime_entity(&runtime, "ball");

    assert!(
        (captured.position.sub(center).length() - expected_radius).abs() < 5e-2,
        "expected entity arc-track to place the ball on the effective center path instead of the authored centerline, got radial distance {:.3}",
        captured.position.sub(center).length(),
    );
    assert!(captured.velocity.x > 0.0, "ball_vx={}", captured.velocity.x);

    run_steps(&mut runtime, 11);
    let released = runtime_entity(&runtime, "ball");

    assert!(
        (released.position.sub(center).length() - expected_radius).abs() > 5e-2,
        "expected entity arc-track to release back into free motion, got radial distance {:.3}",
        released.position.sub(center).length(),
    );
    assert!(released.velocity.x > 0.0, "ball_vx={}", released.velocity.x);
}

#[test]
fn arc_track_regression_block_anchored_handoff_preserves_ideal_guide_motion() {
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

    run_steps(&mut runtime, 12);
    let frame = runtime_entity(&runtime, "ball");
    let radial = frame.position.sub(center);

    assert!(
        (radial.length() - expected_radius).abs() < 5e-2,
        "expected anchored handoff to keep the ball on the guide, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial.length(),
    );
    assert!(
        radial.dot(frame.velocity).abs() < 5e-2,
        "expected ideal guide motion to keep velocity tangent to the arc, got radial_dot_velocity={:.3}",
        radial.dot(frame.velocity),
    );
}

#[test]
fn arc_track_regression_rotated_block_handoff_preserves_ideal_guide_motion() {
    let anchor_center = vector2(2.0, 2.0);
    let anchor_frame =
        block_anchor_endpoint_frame(anchor_center, 4.0, 0.5, 90.0, ArcTrackAnchorEndpoint::End);
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
        local_tangent_crossing_ball("ball", anchor_frame, -0.02, 1.0, 0.9),
        block("anchor", anchor_center, 4.0, 0.5, 90.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::End,
        arc_track,
        ArcTrackEntryEndpoint::End,
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 6);
    let frame = runtime_entity(&runtime, "ball");
    let radial = frame.position.sub(arc_center);

    assert!(
        (radial.length() - expected_radius).abs() < 5e-2,
        "expected rotated local-tangent handoff to keep the ball on the guide, got position=({:.3}, {:.3}) distance={:.3}",
        frame.position.x,
        frame.position.y,
        radial.length(),
    );
    assert!(
        radial.dot(frame.velocity).abs() < 5e-2,
        "expected rotated handoff to preserve tangent-only motion, got radial_dot_velocity={:.3}",
        radial.dot(frame.velocity),
    );
}
