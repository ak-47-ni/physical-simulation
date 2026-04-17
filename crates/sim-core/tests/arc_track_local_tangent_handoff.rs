use sim_core::arc_track::{
    ArcTrackAnchorEndpoint, DEFAULT_ARC_TRACK_THICKNESS, box_local_tangent_handoff_geometry,
    contact_path_radius, radial_for_angle,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn approx_eq(a: f64, b: f64) {
    assert!((a - b).abs() <= 1e-9, "left={a:.12} right={b:.12}");
}

fn assert_vector_eq(actual: Vector2, expected: Vector2) {
    approx_eq(actual.x, expected.x);
    approx_eq(actual.y, expected.y);
}

fn compile_arc_track(
    center: Vector2,
    radius: f64,
    rotation_degrees: f64,
    central_angle_degrees: f64,
) -> sim_core::arc_track::CompiledArcTrack {
    let compiled = compile_scene(&CompileSceneRequest {
        entities: vec![EntityDefinition {
            id: "arc-track-1".to_string(),
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
        }],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: Vector2::ZERO,
        }],
        analyzers: vec![],
    })
    .expect("arc-track scene should compile");

    compiled
        .arc_tracks
        .into_iter()
        .next()
        .expect("scene should contain one compiled arc-track")
}

#[test]
fn box_local_tangent_handoff_geometry_uses_rotated_support_axes() {
    let rotation_radians = 30.0_f64.to_radians();
    let geometry = box_local_tangent_handoff_geometry(
        vector2(2.0, 2.25),
        vector2(2.0, 0.25),
        rotation_radians,
        ArcTrackAnchorEndpoint::End,
    );

    assert_vector_eq(
        geometry.tangent,
        vector2(1.0, 0.0).rotated(rotation_radians),
    );
    assert_vector_eq(
        geometry.surface_normal,
        vector2(0.0, -1.0).rotated(rotation_radians),
    );
    assert!(geometry.tangent.y.abs() > 0.1);
    assert!(geometry.surface_normal.x.abs() > 0.1);
}

#[test]
fn compiled_arc_track_local_tangent_handoff_geometry_matches_rotated_anchor_endpoint() {
    let radius = 2.0;
    let rotation_radians = 30.0_f64.to_radians();
    let arc_end_angle = 60.0_f64.to_radians();
    let anchor_geometry = box_local_tangent_handoff_geometry(
        vector2(2.0, 2.25),
        vector2(2.0, 0.25),
        rotation_radians,
        ArcTrackAnchorEndpoint::End,
    );
    let center = anchor_geometry
        .position
        .sub(radial_for_angle(arc_end_angle).scale(contact_path_radius(
            radius,
            DEFAULT_ARC_TRACK_THICKNESS,
            ArcTrackSide::Inside,
        )));
    let compiled_arc_track = compile_arc_track(center, radius, 15.0, 45.0);

    let handoff_geometry =
        compiled_arc_track.local_tangent_handoff_geometry(ArcTrackEntryEndpoint::End);

    assert_vector_eq(handoff_geometry.position, anchor_geometry.position);
    assert_vector_eq(handoff_geometry.tangent, anchor_geometry.tangent);
    assert_vector_eq(
        handoff_geometry.surface_normal,
        anchor_geometry.surface_normal,
    );
    assert_eq!(compiled_arc_track.side, ArcTrackSide::Inside);
}
