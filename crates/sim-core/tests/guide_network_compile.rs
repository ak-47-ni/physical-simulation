use std::collections::HashMap;

use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackEntityCompileMetadata,
    CompiledArcTrackAnchor, angle_radians_for_position,
};
use sim_core::constraint::ArcTrackEntryEndpoint;
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::guide_network::{CompiledGuideSegment, GuideSegmentEndpoint};
use sim_core::scene::{CompileSceneRequest, compile_scene, compile_scene_with_arc_track_metadata};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
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
        friction_coefficient: 0.1,
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
) -> (Vector2, Vector2) {
    let axis_x = vector2(1.0, 0.0);
    let top_center = center.add(vector2(0.0, -height * 0.5));
    let half_width_offset = axis_x.scale(width * 0.5);

    match endpoint {
        ArcTrackAnchorEndpoint::Start => (top_center.sub(half_width_offset), axis_x.scale(-1.0)),
        ArcTrackAnchorEndpoint::End => (top_center.add(half_width_offset), axis_x),
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

#[test]
fn guide_network_compile_links_board_top_endpoint_to_arc_track_entry() {
    let board_center = vector2(0.0, 0.0);
    let board_width = 4.0;
    let board_height = 0.5;
    let (endpoint_position, endpoint_tangent) = board_endpoint_frame(
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

    let board_segment = compiled
        .guide_network
        .segment("guide:board:top")
        .expect("board top guide should compile");
    let arc_segment = compiled
        .guide_network
        .segment("guide:arc-track:arc")
        .expect("arc-track guide should compile");

    let (board_end_node, board_direction) = match board_segment {
        CompiledGuideSegment::Linear(linear) => {
            assert_eq!(linear.source_entity_id, "board");
            assert_eq!(linear.start, vector2(-2.0, -0.25));
            assert_eq!(linear.end, vector2(2.0, -0.25));
            (linear.end_node_id.as_str(), linear.direction)
        }
        CompiledGuideSegment::Arc(_) => panic!("board top should compile as linear guide"),
    };
    let arc_entry_node = match arc_segment {
        CompiledGuideSegment::Arc(arc) => {
            assert_eq!(arc.source_arc_track_id, "arc-track");
            arc.end_node_id.as_str()
        }
        CompiledGuideSegment::Linear(_) => panic!("arc-track should compile as arc guide"),
    };

    assert_eq!(board_end_node, arc_entry_node);
    assert!(board_direction.dot(endpoint_tangent) > 0.999);
    assert_eq!(
        compiled
            .guide_network
            .successors_from("guide:board:top", GuideSegmentEndpoint::End),
        vec!["guide:arc-track:arc"]
    );
}

#[test]
fn guide_network_compile_uses_anchored_metadata_as_authoritative_connection() {
    let board_center = vector2(0.0, 0.0);
    let board_width = 4.0;
    let board_height = 0.5;
    let (endpoint_position, endpoint_tangent) = board_endpoint_frame(
        board_center,
        board_width,
        board_height,
        ArcTrackAnchorEndpoint::End,
    );
    let mut arc_track = anchored_arc_track_entity(
        "arc-track",
        endpoint_position,
        endpoint_tangent,
        1.25,
        90.0,
        ArcTrackEntryEndpoint::End,
    );
    arc_track.position = arc_track.position.add(vector2(0.018, -0.012));
    let compiled = compile_scene_with_arc_track_metadata(
        &CompileSceneRequest {
            entities: vec![
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

    let board_segment = compiled
        .guide_network
        .segment("guide:board:top")
        .expect("board top guide should compile");
    let arc_segment = compiled
        .guide_network
        .segment("guide:arc-track:arc")
        .expect("arc-track guide should compile");

    let board_end_node = match board_segment {
        CompiledGuideSegment::Linear(linear) => linear.end_node_id.as_str(),
        CompiledGuideSegment::Arc(_) => panic!("board top should compile as linear guide"),
    };
    let arc_entry_node = match arc_segment {
        CompiledGuideSegment::Arc(arc) => arc.end_node_id.as_str(),
        CompiledGuideSegment::Linear(_) => panic!("arc-track should compile as arc guide"),
    };

    assert_eq!(
        compiled
            .guide_network
            .successors_from("guide:board:top", GuideSegmentEndpoint::End),
        vec!["guide:arc-track:arc"],
        "anchored metadata should force a stable topology even when authored geometry drifts"
    );
    assert_eq!(
        board_end_node, arc_entry_node,
        "authoritative compile should collapse the junction to the board endpoint node"
    );
}

#[test]
fn guide_network_compile_arc_guides_use_contact_path_radius_instead_of_centerline_radius() {
    let compiled = compile_scene(&CompileSceneRequest {
        entities: vec![arc_track_entity(
            "arc-track",
            vector2(0.0, 0.0),
            2.5,
            120.0,
            0.0,
        )],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    })
    .expect("scene should compile");

    let arc_segment = compiled
        .guide_network
        .segment("guide:arc-track:arc")
        .expect("arc-track guide should compile");

    match arc_segment {
        CompiledGuideSegment::Arc(arc) => {
            assert!(
                (arc.radius - 2.41).abs() < 1e-9,
                "inside arc guides should use the inner contact-path radius, got {}",
                arc.radius
            );
        }
        CompiledGuideSegment::Linear(_) => panic!("arc-track should compile as arc guide"),
    }
}
