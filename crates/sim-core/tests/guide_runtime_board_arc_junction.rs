use std::collections::HashMap;

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
    let center = board_endpoint_position.sub(radial.scale(radius));
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
                progress < 1.25 * 90.0_f64.to_radians(),
                "arc progress should move inward from the connected end"
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
fn guide_runtime_terminal_zone_handoff_does_not_wait_for_exact_endpoint_crossing() {
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
            RuntimeGuideState::OnGuide { ref segment_id, .. } if segment_id == "guide:arc-track:arc"
        ),
        "terminal-zone handoff should switch to the successor arc before exact endpoint overshoot"
    );
}
