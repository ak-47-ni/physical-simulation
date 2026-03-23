use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::RuntimeScene;
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
    friction: f64,
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
        friction_coefficient: friction,
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
        friction_coefficient: 0.2,
        restitution_coefficient: restitution,
    }
}

fn runtime_for_scene(entities: Vec<EntityDefinition>) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities,
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: vector2(0.0, -9.81),
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

#[test]
fn mechanics_regression_prevents_a_falling_body_from_passing_through_ground() {
    let mut runtime = runtime_for_scene(vec![
        block(
            "ground",
            vector2(0.0, 0.0),
            (20.0, 1.0),
            vector2(0.0, 0.0),
            true,
            0.8,
            0.0,
        ),
        ball("ball-1", vector2(0.0, 4.0), 0.5, vector2(0.0, 0.0), 0.0),
    ]);

    run_steps(&mut runtime, 80);
    let frame = runtime.current_frame();
    let ball = frame
        .entities
        .iter()
        .find(|entity| entity.entity_id == "ball-1")
        .expect("ball should exist");

    assert!(ball.position.y >= 1.0 - 1e-6);
    assert!(ball.velocity.y.abs() < 0.5);
}

#[test]
fn mechanics_regression_restitution_changes_bounce_response() {
    let mut low_restitution = runtime_for_scene(vec![
        block(
            "ground",
            vector2(0.0, 0.0),
            (20.0, 1.0),
            vector2(0.0, 0.0),
            true,
            0.2,
            0.0,
        ),
        ball("ball-low", vector2(0.0, 4.0), 0.5, vector2(0.0, 0.0), 0.0),
    ]);
    let mut high_restitution = runtime_for_scene(vec![
        block(
            "ground",
            vector2(0.0, 0.0),
            (20.0, 1.0),
            vector2(0.0, 0.0),
            true,
            0.2,
            0.9,
        ),
        ball("ball-high", vector2(0.0, 4.0), 0.5, vector2(0.0, 0.0), 0.9),
    ]);

    let mut low_max_upward_velocity = 0.0_f64;
    let mut high_max_upward_velocity = 0.0_f64;

    for _ in 0..120 {
        low_max_upward_velocity =
            low_max_upward_velocity.max(low_restitution.step().entities[1].velocity.y);
        high_max_upward_velocity =
            high_max_upward_velocity.max(high_restitution.step().entities[1].velocity.y);
    }

    assert!(high_max_upward_velocity > low_max_upward_velocity + 1.0);
}

#[test]
fn mechanics_regression_friction_reduces_sliding_motion_on_a_board() {
    let mut runtime = runtime_for_scene(vec![
        block(
            "board",
            vector2(0.0, 0.0),
            (20.0, 1.0),
            vector2(0.0, 0.0),
            true,
            0.9,
            0.0,
        ),
        block(
            "slider",
            vector2(0.0, 1.0),
            (1.0, 1.0),
            vector2(5.0, 0.0),
            false,
            0.9,
            0.0,
        ),
    ]);

    let initial_velocity_x = runtime.current_frame().entities[1].velocity.x.abs();
    run_steps(&mut runtime, 40);
    let final_velocity_x = runtime.current_frame().entities[1].velocity.x.abs();

    assert!(final_velocity_x < initial_velocity_x);
}
