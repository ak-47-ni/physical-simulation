use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn ball(
    id: &str,
    position: Vector2,
    radius: f64,
    initial_velocity: Vector2,
    restitution: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius },
        position,
        rotation_radians: 0.0,
        initial_velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.1,
        restitution_coefficient: restitution,
    }
}

fn runtime_for_scene_with_gravity(
    entities: Vec<EntityDefinition>,
    gravity: Vector2,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities,
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: gravity,
        }],
        analyzers: vec![],
    })
    .expect("scene should compile");

    RuntimeScene::new(compiled, 0.05)
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
        .iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist")
        .clone()
}

#[test]
fn quadrant_boundary_regression_runtime_wall_at_x_zero_keeps_bodies_non_negative() {
    let radius = 0.25;
    let mut runtime = runtime_for_scene_with_gravity(
        vec![ball(
            "ball",
            vector2(0.6, 1.0),
            radius,
            vector2(-4.0, 0.0),
            0.0,
        )],
        Vector2::ZERO,
    );

    run_steps(&mut runtime, 12);
    let ball = runtime_entity(&runtime, "ball");

    assert!(
        ball.position.x >= radius - 1e-6,
        "expected implicit x=0 wall to keep the body in the first quadrant, got x={}",
        ball.position.x
    );
}

#[test]
fn quadrant_boundary_regression_runtime_ground_at_y_zero_keeps_bodies_non_negative() {
    let radius = 0.25;
    let mut runtime = runtime_for_scene_with_gravity(
        vec![ball(
            "ball",
            vector2(0.8, 0.8),
            radius,
            vector2(0.0, -1.0),
            0.0,
        )],
        vector2(0.0, -9.81),
    );

    run_steps(&mut runtime, 24);
    let ball = runtime_entity(&runtime, "ball");

    assert!(
        ball.position.y >= radius - 1e-6,
        "expected implicit y=0 boundary to keep the body in the first quadrant, got y={}",
        ball.position.y
    );
}

#[test]
fn quadrant_boundary_regression_boundaries_behave_like_fixed_supports_not_teleport_clamps() {
    let radius = 0.25;
    let mut runtime = runtime_for_scene_with_gravity(
        vec![ball(
            "ball",
            vector2(0.5, 0.7),
            radius,
            vector2(-3.0, -2.0),
            0.6,
        )],
        vector2(0.0, -4.0),
    );

    run_steps(&mut runtime, 20);
    let ball = runtime_entity(&runtime, "ball");

    assert!(
        ball.position.x >= radius - 1e-6 && ball.position.y >= radius - 1e-6,
        "expected support-like boundaries to keep the body inside the first quadrant, got ({}, {})",
        ball.position.x,
        ball.position.y
    );
    assert!(
        ball.velocity.x > -0.5 || ball.velocity.y > -0.5,
        "expected wall/ground contact to change motion instead of leaving pure inbound velocity, got ({}, {})",
        ball.velocity.x,
        ball.velocity.y
    );
}
