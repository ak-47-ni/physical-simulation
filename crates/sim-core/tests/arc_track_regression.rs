use sim_core::constraint::{ArcTrackSide, ConstraintDefinition};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

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

#[test]
fn arc_track_regression_bowl_segment_keeps_ball_attached() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(4.0, 2.0), vector2(0.6, 0.0)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            entity_id: "ball".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 225.0,
            end_angle_degrees: 315.0,
            side: ArcTrackSide::Inside,
        },
        vector2(0.0, -9.81),
        0.02,
    );

    run_steps(&mut runtime, 24);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - 2.0).abs() < 5e-2);
}

#[test]
fn arc_track_regression_detaches_when_support_would_need_to_pull() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(4.0, 6.0), Vector2::ZERO),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            entity_id: "ball".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 45.0,
            end_angle_degrees: 135.0,
            side: ArcTrackSide::Inside,
        },
        vector2(0.0, -9.81),
        0.05,
    );

    run_steps(&mut runtime, 4);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.y < 6.0 - 1e-3);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
}

#[test]
fn arc_track_regression_detaches_at_arc_end_and_continues_free_flight() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(4.85, 2.19), vector2(2.3, 1.1)),
        ConstraintDefinition::ArcTrack {
            id: "arc-track".to_string(),
            entity_id: "ball".to_string(),
            center,
            radius: 2.0,
            start_angle_degrees: 240.0,
            end_angle_degrees: 300.0,
            side: ArcTrackSide::Inside,
        },
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 6);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.x > 5.0);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
    assert!(frame.velocity.x > 0.0);
}
