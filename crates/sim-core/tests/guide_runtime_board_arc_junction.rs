use std::collections::HashMap;

use sim_core::arc_track::{
    angle_radians_for_position, contact_path_radius, ArcTrackAnchorEndpoint,
    ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata, CompiledArcTrackAnchor,
    DEFAULT_ARC_TRACK_THICKNESS,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::guide_runtime::RuntimeGuideState;
use sim_core::runtime::{RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{compile_scene_with_arc_track_metadata, CompileSceneRequest};

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
