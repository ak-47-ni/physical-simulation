use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn block(
    id: &str,
    position: Vector2,
    size: (f64, f64),
    initial_velocity: Vector2,
    is_static: bool,
    restitution: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: size.0,
            height: size.1,
        },
        position,
        rotation_radians: 0.0,
        initial_velocity,
        mass: if is_static { 0.0 } else { 1.0 },
        is_static,
        friction_coefficient: 0.1,
        restitution_coefficient: restitution,
    }
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

fn runtime_for_scene(entities: Vec<EntityDefinition>, gravity: Vector2) -> RuntimeScene {
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
fn collision_tunneling_regression_fast_ball_ball_impact_does_not_cross_through() {
    let mut runtime = runtime_for_scene(
        vec![
            ball("left", vector2(-3.0, 0.0), 0.5, vector2(80.0, 0.0), 1.0),
            ball("right", vector2(3.0, 0.0), 0.5, vector2(-80.0, 0.0), 1.0),
        ],
        Vector2::ZERO,
    );

    runtime.step();
    let left = runtime_entity(&runtime, "left");
    let right = runtime_entity(&runtime, "right");

    assert!(
        left.position.x < right.position.x,
        "left_x={} right_x={} left_vx={} right_vx={}",
        left.position.x,
        right.position.x,
        left.velocity.x,
        right.velocity.x
    );
    assert!(left.velocity.x <= 0.0, "left_vx={}", left.velocity.x);
    assert!(right.velocity.x >= 0.0, "right_vx={}", right.velocity.x);
}

#[test]
fn collision_tunneling_regression_fast_block_block_impact_does_not_cross_through() {
    let mut runtime = runtime_for_scene(
        vec![
            block(
                "left",
                vector2(-5.0, 0.0),
                (1.0, 1.0),
                vector2(120.0, 0.0),
                false,
                1.0,
            ),
            block(
                "right",
                vector2(0.0, 0.0),
                (1.0, 1.0),
                vector2(0.0, 0.0),
                false,
                1.0,
            ),
        ],
        Vector2::ZERO,
    );

    runtime.step();
    let left = runtime_entity(&runtime, "left");
    let right = runtime_entity(&runtime, "right");

    assert!(left.position.x < right.position.x);
    assert!(left.velocity.x <= 0.0);
    assert!(right.velocity.x >= 0.0);
}

#[test]
fn collision_tunneling_regression_fast_body_does_not_tunnel_through_locked_ground() {
    let mut runtime = runtime_for_scene(
        vec![
            block(
                "ground",
                vector2(0.0, 0.0),
                (20.0, 1.0),
                Vector2::ZERO,
                true,
                1.0,
            ),
            ball("ball", vector2(0.0, 4.0), 0.5, vector2(0.0, -100.0), 1.0),
        ],
        vector2(0.0, -9.81),
    );

    runtime.step();
    let ball = runtime_entity(&runtime, "ball");

    assert!(ball.position.y >= 1.0 - 1e-6, "ball_y={}", ball.position.y);
    assert!(ball.velocity.y >= 0.0, "ball_vy={}", ball.velocity.y);
}
