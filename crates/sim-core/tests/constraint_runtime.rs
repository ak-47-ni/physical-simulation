use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

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
