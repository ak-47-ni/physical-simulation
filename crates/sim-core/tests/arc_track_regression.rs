use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeFramePayload, RuntimeScene};
use sim_core::scene::{compile_scene, CompileSceneRequest};

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

    assert!((frame.position.sub(center).length() - 2.0).abs() < 5e-2);
    assert!(frame.position.x > 4.0);
    assert!(frame.position.y > 2.0);
}

#[test]
fn arc_track_regression_detaches_when_support_would_need_to_pull() {
    let center = vector2(4.0, 4.0);
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
            - 2.0)
            .abs()
            < 5e-2
    );

    run_steps(&mut runtime, 5);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.y < 6.0 - 1e-3);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
}

#[test]
fn arc_track_regression_detaches_at_arc_end_and_continues_free_flight() {
    let center = vector2(4.0, 4.0);
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

    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
    assert!(frame.velocity.x > 0.0);
}

#[test]
fn arc_track_regression_arc_track_entity_guides_ball_then_releases_tangentially() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene_with_arc_entity(
        ball("ball", vector2(3.7, 2.0), vector2(2.8, 0.0)),
        arc_track_entity("arc-track", center, 2.0, 30.0, 60.0),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 1);
    let captured = runtime_entity(&runtime, "ball");

    assert!(
        (captured.position.sub(center).length() - 2.0).abs() < 5e-2,
        "expected entity arc-track to guide the captured ball, got radial distance {:.3}",
        captured.position.sub(center).length(),
    );
    assert!(captured.velocity.x > 0.0, "ball_vx={}", captured.velocity.x);

    run_steps(&mut runtime, 11);
    let released = runtime_entity(&runtime, "ball");

    assert!(
        (released.position.sub(center).length() - 2.0).abs() > 5e-2,
        "expected entity arc-track to release back into free motion, got radial distance {:.3}",
        released.position.sub(center).length(),
    );
    assert!(released.velocity.x > 0.0, "ball_vx={}", released.velocity.x);
}
