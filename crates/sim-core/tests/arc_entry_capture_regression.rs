use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
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

fn entry_arc() -> ConstraintDefinition {
    ConstraintDefinition::ArcTrack {
        id: "arc-track".to_string(),
        center: vector2(4.0, 4.0),
        radius: 2.0,
        start_angle_degrees: 270.0,
        end_angle_degrees: 330.0,
        side: ArcTrackSide::Inside,
        entry_endpoint: ArcTrackEntryEndpoint::Start,
    }
}

#[test]
fn arc_entry_capture_regression_aligned_ball_enters_at_configured_endpoint() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(3.6, 2.0), vector2(2.0, 0.0)),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 6);
    let frame = runtime_entity(&runtime, "ball");

    assert!((frame.position.sub(center).length() - 2.0).abs() < 5e-2);
    assert!(frame.position.x > 4.0);
    assert!(frame.position.y > 2.0);
}

#[test]
fn arc_entry_capture_regression_wrong_direction_does_not_enter() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(5.0, 2.0), vector2(-2.0, 0.0)),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 4);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.x < 5.0);
    assert!((frame.position.y - 2.0).abs() < 1e-6);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 5e-2);
}

#[test]
fn arc_entry_capture_regression_distant_ball_does_not_enter() {
    let center = vector2(4.0, 4.0);
    let mut runtime = runtime_for_scene(
        ball("ball", vector2(1.0, 2.0), vector2(2.0, 0.0)),
        entry_arc(),
        Vector2::ZERO,
        0.05,
    );

    run_steps(&mut runtime, 3);
    let frame = runtime_entity(&runtime, "ball");

    assert!(frame.position.x < 2.0);
    assert!((frame.position.y - 2.0).abs() < 1e-6);
    assert!((frame.position.sub(center).length() - 2.0).abs() > 0.5);
}
