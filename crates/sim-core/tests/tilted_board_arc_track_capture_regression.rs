use std::{collections::HashMap, f64::consts::FRAC_PI_6};

use sim_core::analyzer::AnalyzerDefinition;
use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, angle_radians_for_position,
};
use sim_core::constraint::ArcTrackEntryEndpoint;
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::guide_runtime::RuntimeGuideState;
use sim_core::runtime::RuntimeScene;
use sim_core::scene::{CompileSceneRequest, compile_scene_with_arc_track_metadata};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn ball(
    id: &str,
    position: Vector2,
    radius: f64,
    initial_velocity: Vector2,
    friction: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius },
        position,
        rotation_radians: 0.0,
        initial_velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: friction,
        restitution_coefficient: 0.0,
    }
}

fn board(
    id: &str,
    position: Vector2,
    size: (f64, f64),
    friction: f64,
    rotation_radians: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: size.0,
            height: size.1,
        },
        position,
        rotation_radians,
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: friction,
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
            thickness: 0.18,
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

fn block_anchor_endpoint_frame(
    center: Vector2,
    width: f64,
    height: f64,
    rotation_radians: f64,
    endpoint: ArcTrackAnchorEndpoint,
) -> AnchorEndpointFrame {
    let axis_x = vector2(1.0, 0.0).rotated(rotation_radians);
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
    let center = anchor_frame.position.sub(radial.scale(radius));
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
            analyzers: vec![AnalyzerDefinition::Trajectory {
                id: "traj-1".to_string(),
                entity_id: "ball".to_string(),
            }],
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

fn distance_to_arc(position: Vector2, center: Vector2, radius: f64) -> f64 {
    (position.sub(center).length() - radius).abs()
}

#[test]
fn tilted_board_arc_track_capture_regression_board_supported_ball_enters_arc() {
    let board_center = vector2(8.0, 6.0);
    let board_size = (8.0, 0.5);
    let ball_radius = 0.4;
    let anchor_frame = block_anchor_endpoint_frame(
        board_center,
        board_size.0,
        board_size.1,
        FRAC_PI_6,
        ArcTrackAnchorEndpoint::Start,
    );
    let board_support_normal = anchor_frame.surface_normal.scale(-1.0);
    let initial_ball_position = anchor_frame
        .position
        .add(anchor_frame.tangent.scale(-0.6))
        .add(board_support_normal.scale(ball_radius - 0.02));
    let arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        1.2,
        90.0,
        ArcTrackEntryEndpoint::Start,
    );
    let arc_center = arc_track.position;
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        ball(
            "ball",
            initial_ball_position,
            ball_radius,
            anchor_frame.tangent.scale(0.6),
            0.05,
        ),
        board("board", board_center, board_size, 0.05, FRAC_PI_6),
        ArcTrackAnchorEntityKind::Board,
        ArcTrackAnchorEndpoint::Start,
        arc_track,
        ArcTrackEntryEndpoint::Start,
        vector2(0.0, -9.81),
        0.05,
    );

    for _ in 0..24 {
        runtime.step();
    }

    let samples = runtime
        .analyzer_samples("traj-1")
        .expect("trajectory samples should exist");
    let first_on_arc_index = samples.iter().position(|sample| {
        sample.frame_number > 0 && distance_to_arc(sample.position, arc_center, 1.2) <= 0.06
    });
    let closest_sample = samples
        .iter()
        .filter(|sample| sample.frame_number > 0)
        .min_by(|left, right| {
            distance_to_arc(left.position, arc_center, 1.2)
                .partial_cmp(&distance_to_arc(right.position, arc_center, 1.2))
                .expect("distances should be comparable")
        })
        .map(|sample| {
            (
                sample.frame_number,
                sample.position,
                sample.velocity,
                distance_to_arc(sample.position, arc_center, 1.2),
            )
        });

    assert!(
        first_on_arc_index.is_some(),
        "expected a board-supported ball on a tilted board to enter the anchored arc-track instead of falling through the junction; anchor_frame={anchor_frame:?} board_support_normal={board_support_normal:?} closest_sample={closest_sample:?}",
    );
}

#[test]
fn tilted_board_arc_track_capture_regression_authored_junction_switches_to_arc_guide() {
    let board_center = vector2(8.0, 6.0);
    let board_size = (8.0, 0.5);
    let ball_radius = 0.4;
    let anchor_frame = block_anchor_endpoint_frame(
        board_center,
        board_size.0,
        board_size.1,
        FRAC_PI_6,
        ArcTrackAnchorEndpoint::Start,
    );
    let initial_ball_position = anchor_frame
        .position
        .add(anchor_frame.tangent.scale(-0.6))
        .add(anchor_frame.surface_normal.scale(ball_radius - 0.02));
    let mut arc_track = anchored_arc_track_entity(
        "arc-track",
        anchor_frame,
        1.2,
        90.0,
        ArcTrackEntryEndpoint::Start,
    );
    arc_track.position = arc_track.position.add(anchor_frame.tangent.scale(0.018));
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        ball(
            "ball",
            initial_ball_position,
            ball_radius,
            anchor_frame.tangent.scale(0.6),
            0.05,
        ),
        board("board", board_center, board_size, 0.05, FRAC_PI_6),
        ArcTrackAnchorEntityKind::Board,
        ArcTrackAnchorEndpoint::Start,
        arc_track,
        ArcTrackEntryEndpoint::Start,
        vector2(0.0, -9.81),
        0.0125,
    );
    let mut saw_arc_guide = false;

    for _ in 0..96 {
        runtime.step();

        if matches!(
            runtime.guide_state("ball"),
            RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:arc-track:arc"
        ) {
            saw_arc_guide = true;
            break;
        }
    }

    assert!(
        saw_arc_guide,
        "authored tilted-board junction should switch guide_state to the arc even with small anchor drift"
    );
}
