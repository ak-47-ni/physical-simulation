use std::collections::HashMap;

use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS, angle_radians_for_position,
    contact_path_radius, effective_center_radius,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::guide_runtime::RuntimeGuideState;
use sim_core::runtime::RuntimeScene;
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

fn inside_effective_radius(radius: f64, body_radius: f64) -> f64 {
    effective_center_radius(
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        body_radius,
        ArcTrackSide::Inside,
    )
}

fn runtime_for_board_arc_scene(
    initial_ball_position: Vector2,
    initial_ball_velocity: Vector2,
    fixed_delta_seconds: f64,
) -> (RuntimeScene, Vector2) {
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
        ArcTrackEntryEndpoint::Start,
    );
    let arc_center = arc_track.position;
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
                entry_endpoint: Some(ArcTrackEntryEndpoint::Start),
            },
        )]),
    )
    .expect("scene should compile");

    (RuntimeScene::new(compiled, fixed_delta_seconds), arc_center)
}

#[test]
fn guide_runtime_arc_segment_detaches_to_free_when_support_is_insufficient() {
    let board_center = vector2(0.0, 0.0);
    let (_, tangent, surface_normal) =
        board_endpoint_frame(board_center, 4.0, 0.5, ArcTrackAnchorEndpoint::End);
    let initial_position = vector2(1.25, -0.25).add(surface_normal.scale(0.4));
    let initial_velocity = tangent.scale(1.6);
    let (mut runtime, arc_center) =
        runtime_for_board_arc_scene(initial_position, initial_velocity, 0.025);
    let expected_radius = inside_effective_radius(1.25, 0.4);
    let mut closest_distance = f64::INFINITY;
    let mut saw_arc_guide = false;
    let mut first_free_after_arc: Option<(Vector2, Vector2)> = None;

    for _ in 0..24 {
        let frame = runtime.step();
        let ball_frame = frame
            .entities
            .iter()
            .find(|entity| entity.entity_id == "ball")
            .expect("ball should exist");
        let distance = (ball_frame.position.sub(arc_center).length() - expected_radius).abs();

        closest_distance = closest_distance.min(distance);
        match runtime.guide_state("ball") {
            RuntimeGuideState::OnGuide { ref segment_id, .. }
                if segment_id == "guide:arc-track:arc" =>
            {
                saw_arc_guide = true;
            }
            RuntimeGuideState::Free if saw_arc_guide && first_free_after_arc.is_none() => {
                first_free_after_arc = Some((ball_frame.position, ball_frame.velocity));
            }
            RuntimeGuideState::Free | RuntimeGuideState::OnGuide { .. } => {}
        }
    }

    assert!(
        closest_distance < 6e-2,
        "ball should briefly enter the connected arc guide before detaching"
    );
    assert!(matches!(
        runtime.guide_state("ball"),
        RuntimeGuideState::Free
    ));
    let (first_free_position, first_free_velocity) = first_free_after_arc
        .expect("ball should detach into a free frame after entering the connected arc guide");
    let radial = first_free_position.sub(arc_center);
    let radial_distance = radial.length();

    assert!(
        radial.dot(first_free_velocity).abs() > 5e-2,
        "detached ball should immediately leave the arc with a non-tangential free-flight velocity"
    );
    assert!(
        radial_distance >= expected_radius - 1e-3,
        "detached body should not tunnel inward through the arc shell within the same substep, got radial_distance={:.3} effective_radius={:.3}",
        radial_distance,
        expected_radius,
    );
}
