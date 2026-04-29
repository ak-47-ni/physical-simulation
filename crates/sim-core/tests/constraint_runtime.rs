use std::collections::HashMap;

use sim_core::arc_track::{
    contact_path_radius, effective_center_radius, ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind,
    ArcTrackEntityCompileMetadata, CompiledArcTrackAnchor, DEFAULT_ARC_TRACK_THICKNESS,
};
use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{compile_scene, compile_scene_with_arc_track_metadata, CompileSceneRequest};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn body(id: &str, position: Vector2, velocity: Vector2, is_static: bool) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: 1.0,
            height: 1.0,
        },
        position,
        rotation_radians: 0.0,
        initial_velocity: velocity,
        mass: if is_static { 0.0 } else { 1.0 },
        is_static,
        friction_coefficient: 0.2,
        restitution_coefficient: 0.0,
    }
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

fn static_block(
    id: &str,
    position: Vector2,
    width: f64,
    height: f64,
    rotation_degrees: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block { width, height },
        position,
        rotation_radians: rotation_degrees.to_radians(),
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: 0.2,
        restitution_coefficient: 0.0,
    }
}

fn runtime_for_scene(
    entities: Vec<EntityDefinition>,
    constraints: Vec<ConstraintDefinition>,
    gravity: Vector2,
    fixed_delta_seconds: f64,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities,
        constraints,
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

fn arc_tangential_speed(center: Vector2, entity: &sim_core::runtime::RuntimeEntityFrame) -> f64 {
    let radial = entity.position.sub(center).normalized();
    let tangent = radial.perp().scale(-1.0);

    entity.velocity.dot(tangent)
}

fn free_arc_entry_geometry(
    center: Vector2,
    radius: f64,
    start_angle_degrees: f64,
    end_angle_degrees: f64,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> sim_core::arc_track::ArcTrackEndpointGeometry {
    sim_core::arc_track::endpoint_geometry(
        center,
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        start_angle_degrees.to_radians(),
        end_angle_degrees.to_radians(),
        ArcTrackSide::Inside,
        entry_endpoint,
    )
}

fn free_arc_entry_center_path_position(
    entry: sim_core::arc_track::ArcTrackEndpointGeometry,
) -> Vector2 {
    entry.position.add(entry.support_direction.scale(0.5))
}

fn inside_effective_radius(radius: f64) -> f64 {
    effective_center_radius(
        contact_path_radius(radius, DEFAULT_ARC_TRACK_THICKNESS, ArcTrackSide::Inside),
        0.5,
        ArcTrackSide::Inside,
    )
}

#[test]
fn constraint_runtime_spring_acceleration_changes_with_stretch() {
    let mut relaxed_runtime = runtime_for_scene(
        vec![
            body("anchor", vector2(0.0, 0.0), Vector2::ZERO, true),
            body("payload", vector2(3.0, 0.0), Vector2::ZERO, false),
        ],
        vec![ConstraintDefinition::Spring {
            id: "spring-relaxed".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "payload".to_string(),
            rest_length: 2.5,
            stiffness: 4.0,
        }],
        Vector2::ZERO,
        0.1,
    );
    let mut stretched_runtime = runtime_for_scene(
        vec![
            body("anchor", vector2(0.0, 0.0), Vector2::ZERO, true),
            body("payload", vector2(8.0, 0.0), Vector2::ZERO, false),
        ],
        vec![ConstraintDefinition::Spring {
            id: "spring-stretched".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "payload".to_string(),
            rest_length: 2.5,
            stiffness: 4.0,
        }],
        Vector2::ZERO,
        0.1,
    );

    let relaxed_frame = relaxed_runtime.step();
    let stretched_frame = stretched_runtime.step();
    let relaxed_acceleration = payload_frame(&relaxed_frame, "payload")
        .acceleration
        .x
        .abs();
    let stretched_acceleration = payload_frame(&stretched_frame, "payload")
        .acceleration
        .x
        .abs();

    assert!(stretched_acceleration > relaxed_acceleration);
}

#[test]
fn constraint_runtime_track_projection_applies_to_initial_and_reset_state() {
    let mut runtime = runtime_for_scene(
        vec![body("slider", vector2(0.0, 4.0), vector2(3.0, 2.0), false)],
        vec![ConstraintDefinition::Track {
            id: "track-horizontal".to_string(),
            entity_id: "slider".to_string(),
            origin: vector2(0.0, 1.0),
            axis: vector2(1.0, 0.0),
        }],
        vector2(0.0, -9.81),
        0.1,
    );

    let initial_frame = runtime.current_frame();
    assert!((payload_frame(&initial_frame, "slider").position.y - 1.0).abs() < 1e-6);

    runtime.step();
    let reset_frame = runtime.reset();

    assert!((payload_frame(&reset_frame, "slider").position.y - 1.0).abs() < 1e-6);
    assert!(payload_frame(&reset_frame, "slider").velocity.y.abs() < 1e-6);
}

#[test]
fn constraint_runtime_track_projection_holds_across_many_steps() {
    let mut runtime = runtime_for_scene(
        vec![body("slider", vector2(0.0, 4.0), vector2(3.0, 2.0), false)],
        vec![ConstraintDefinition::Track {
            id: "track-diagonal".to_string(),
            entity_id: "slider".to_string(),
            origin: vector2(1.0, 1.0),
            axis: vector2(1.0, 1.0),
        }],
        vector2(0.0, -9.81),
        0.05,
    );

    for _ in 0..30 {
        runtime.step();
    }

    let frame = runtime.current_frame();
    let slider = payload_frame(&frame, "slider");
    let relative = slider.position.sub(vector2(1.0, 1.0));

    assert!((relative.x - relative.y).abs() < 1e-6);
}

#[test]
fn constraint_runtime_same_time_scale_replays_deterministically_after_reset() {
    let mut runtime = runtime_for_scene(
        vec![
            body("anchor", vector2(0.0, 0.0), Vector2::ZERO, true),
            body("payload", vector2(6.0, 0.0), Vector2::ZERO, false),
        ],
        vec![ConstraintDefinition::Spring {
            id: "spring".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "payload".to_string(),
            rest_length: 2.5,
            stiffness: 5.0,
        }],
        Vector2::ZERO,
        0.1,
    );

    runtime.set_fixed_delta_seconds(0.05);
    for _ in 0..6 {
        runtime.step();
    }
    let first_run_frame = runtime.current_frame();

    runtime.reset();
    runtime.set_fixed_delta_seconds(0.05);
    for _ in 0..6 {
        runtime.step();
    }
    let second_run_frame = runtime.current_frame();

    assert_eq!(first_run_frame, second_run_frame);
}

#[test]
fn constraint_runtime_arc_track_leaves_free_balls_unprojected_in_initial_and_reset_state() {
    let authored_position = vector2(1.5, 6.5);
    let authored_velocity = vector2(1.0, 4.0);
    let mut runtime = runtime_for_scene(
        vec![ball("slider", authored_position, authored_velocity)],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center: vector2(4.0, 4.0),
            radius: 2.0,
            start_angle_degrees: 270.0,
            end_angle_degrees: 330.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        }],
        vector2(0.0, -9.81),
        0.05,
    );

    let initial_frame = runtime.current_frame();
    let initial_slider = payload_frame(&initial_frame, "slider");

    assert_eq!(initial_slider.position, authored_position);
    assert_eq!(initial_slider.velocity, authored_velocity);

    runtime.step();
    let reset_frame = runtime.reset();
    let reset_slider = payload_frame(&reset_frame, "slider");

    assert_eq!(reset_slider.position, authored_position);
    assert_eq!(reset_slider.velocity, authored_velocity);
}

#[test]
fn constraint_runtime_arc_track_does_not_capture_distant_free_balls_across_many_steps() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        vec![ball("slider", vector2(0.5, 6.0), Vector2::ZERO)],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 270.0,
            end_angle_degrees: 330.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        }],
        Vector2::ZERO,
        0.02,
    );

    for _ in 0..40 {
        runtime.step();
    }

    let frame = runtime.current_frame();
    let slider = payload_frame(&frame, "slider");
    let radial = slider.position.sub(center);

    assert!((slider.position.x - 0.5).abs() < 1e-6);
    assert!((slider.position.y - 6.0).abs() < 1e-6);
    assert!((radial.length() - 2.0).abs() > 0.5);
}

#[test]
fn constraint_runtime_arc_track_free_state_replays_deterministically_after_reset() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        vec![ball("slider", vector2(0.5, 6.0), vector2(1.0, -0.5))],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 270.0,
            end_angle_degrees: 330.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        }],
        vector2(0.0, -9.81),
        0.02,
    );

    for _ in 0..16 {
        runtime.step();
    }
    let first_run = runtime.current_frame();

    runtime.reset();
    for _ in 0..16 {
        runtime.step();
    }
    let second_run = runtime.current_frame();

    assert_eq!(first_run, second_run);
}

#[test]
fn constraint_runtime_block_anchored_arc_track_detaches_when_support_would_need_to_pull() {
    let center = vector2(4.0, 4.0);
    let expected_radius = inside_effective_radius(2.0);
    let mut runtime = runtime_for_scene_with_anchored_arc_entity(
        ball("ball", vector2(4.1, 5.5), vector2(-2.0, 0.0)),
        static_block("anchor", vector2(6.0, 6.25), 4.0, 0.5, 0.0),
        ArcTrackAnchorEntityKind::Block,
        ArcTrackAnchorEndpoint::Start,
        arc_track_entity("arc-track", center, 2.0, 60.0, 210.0),
        ArcTrackEntryEndpoint::End,
        vector2(0.0, -9.81),
        0.05,
    );

    let first_frame = runtime.step();
    let captured = payload_frame(&first_frame, "ball");

    assert!(
        (captured.position.sub(center).length() - expected_radius).abs() < 5e-2,
        "expected anchored handoff to capture before detach, got position=({:.3}, {:.3}) distance={:.3}",
        captured.position.x,
        captured.position.y,
        captured.position.sub(center).length(),
    );

    let mut released_frame = runtime.current_frame();

    for _ in 0..5 {
        let frame = runtime.step();
        released_frame = frame;
    }
    let released = payload_frame(&released_frame, "ball");
    let released_radial_distance = released.position.sub(center).length();

    assert!(
        (released_radial_distance - expected_radius).abs() > 5e-2,
        "expected anchored guide to detach when support would need to pull, got position=({:.3}, {:.3}) distance={:.3}",
        released.position.x,
        released.position.y,
        released_radial_distance,
    );
}

#[test]
fn constraint_runtime_continuous_entry_starts_at_endpoint_before_advancing_arc() {
    let center = vector2(10.0, 10.0);
    let radius = 4.0;
    let expected_radius = inside_effective_radius(radius);
    let start_angle_degrees = 270.0;
    let end_angle_degrees = 330.0;
    let entry = free_arc_entry_geometry(
        center,
        radius,
        start_angle_degrees,
        end_angle_degrees,
        ArcTrackEntryEndpoint::Start,
    );
    let entry_center = free_arc_entry_center_path_position(entry);
    let authored_position = entry_center.add(entry.tangent.scale(-0.1));
    let mut runtime = runtime_for_scene(
        vec![ball("slider", authored_position, entry.tangent.scale(19.0))],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius,
            start_angle_degrees,
            end_angle_degrees,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        }],
        Vector2::ZERO,
        0.05,
    );

    let first_frame = runtime.step();
    let slider = payload_frame(&first_frame, "slider");
    let radial_distance = slider.position.sub(center).length();
    let endpoint_distance = slider.position.sub(entry_center).length();

    assert!(
        (radial_distance - expected_radius).abs() < 5e-2,
        "expected continuous sweep entry to attach to the arc, got position=({:.3}, {:.3}) radial_distance={:.3}",
        slider.position.x,
        slider.position.y,
        radial_distance,
    );
    assert!(
        endpoint_distance < 1e-6,
        "first captured arc frame should land at the entry endpoint before advancing along the arc, got endpoint_distance={:.6} position=({:.3}, {:.3}) entry=({:.3}, {:.3})",
        endpoint_distance,
        slider.position.x,
        slider.position.y,
        entry_center.x,
        entry_center.y,
    );

    let second_frame = runtime.step();
    let second_slider = payload_frame(&second_frame, "slider");
    let second_endpoint_distance = second_slider.position.sub(entry_center).length();

    assert!(
        second_endpoint_distance > 0.1,
        "captured body should resume arc motion on the next visible frame instead of staying pinned at the endpoint"
    );
}

#[test]
fn constraint_runtime_continuous_entry_rejects_wrong_direction_sweep() {
    let center = vector2(10.0, 10.0);
    let radius = 4.0;
    let expected_radius = inside_effective_radius(radius);
    let start_angle_degrees = 270.0;
    let end_angle_degrees = 330.0;
    let entry = free_arc_entry_geometry(
        center,
        radius,
        start_angle_degrees,
        end_angle_degrees,
        ArcTrackEntryEndpoint::Start,
    );
    let authored_position = entry.position.add(entry.tangent.scale(0.1));
    let authored_velocity = entry.tangent.scale(-19.0);
    let mut runtime = runtime_for_scene(
        vec![ball("slider", authored_position, authored_velocity)],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius,
            start_angle_degrees,
            end_angle_degrees,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        }],
        Vector2::ZERO,
        0.05,
    );

    let first_frame = runtime.step();
    let slider = payload_frame(&first_frame, "slider");
    let radial_distance = slider.position.sub(center).length();

    assert!(
        (radial_distance - expected_radius).abs() > 0.07,
        "expected wrong-direction sweep to remain off the effective center path instead of attaching, got position=({:.3}, {:.3}) radial_distance={:.3}",
        slider.position.x,
        slider.position.y,
        radial_distance,
    );
}

#[test]
fn constraint_runtime_arc_track_turning_point_reverses_while_staying_on_arc() {
    let center = vector2(10.0, 10.0);
    let radius = 4.0;
    let start_angle_degrees = 270.0;
    let end_angle_degrees = 330.0;
    let expected_radius = inside_effective_radius(radius);
    let entry = free_arc_entry_geometry(
        center,
        radius,
        start_angle_degrees,
        end_angle_degrees,
        ArcTrackEntryEndpoint::End,
    );
    let authored_position =
        free_arc_entry_center_path_position(entry).add(entry.tangent.scale(-0.1));
    let mut runtime = runtime_for_scene(
        vec![ball("slider", authored_position, entry.tangent.scale(0.8))],
        vec![ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            center,
            radius,
            start_angle_degrees,
            end_angle_degrees,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        }],
        vector2(0.0, -9.81),
        0.025,
    );

    let mut saw_negative_arc_speed = false;
    let mut saw_positive_arc_speed = false;

    for _ in 0..160 {
        let frame = runtime.step();
        let slider = payload_frame(&frame, "slider");
        let radial_distance = slider.position.sub(center).length();

        if (radial_distance - expected_radius).abs() > 5e-2 {
            continue;
        }

        let tangential_speed = arc_tangential_speed(center, slider);
        if tangential_speed < -1e-2 {
            saw_negative_arc_speed = true;
        }
        if saw_negative_arc_speed && tangential_speed > 1e-2 {
            saw_positive_arc_speed = true;
            break;
        }
    }

    assert!(
        saw_negative_arc_speed,
        "ball should first enter the arc with the incoming tangential direction from the end entry"
    );
    assert!(
        saw_positive_arc_speed,
        "turning-point motion should stay rail-supported long enough to reverse tangential direction on the arc"
    );
}
