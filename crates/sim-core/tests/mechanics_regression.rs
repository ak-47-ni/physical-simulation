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

fn rotated_block(
    id: &str,
    position: Vector2,
    size: (f64, f64),
    rotation_radians: f64,
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
        rotation_radians,
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
    runtime_for_scene_with_gravity(entities, vector2(0.0, -9.81))
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

fn runtime_entity(
    runtime: &RuntimeScene,
    entity_id: &str,
) -> sim_core::runtime::RuntimeEntityFrame {
    runtime
        .current_frame()
        .entities
        .iter()
        .find(|entity| entity.entity_id == entity_id)
        .expect("entity should exist")
        .clone()
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

#[test]
fn mechanics_regression_dynamic_balls_do_not_pass_through_each_other() {
    let mut runtime = runtime_for_scene_with_gravity(
        vec![
            ball("ball-left", vector2(-2.0, 0.0), 0.5, vector2(5.0, 0.0), 0.8),
            ball(
                "ball-right",
                vector2(2.0, 0.0),
                0.5,
                vector2(-5.0, 0.0),
                0.8,
            ),
        ],
        Vector2::ZERO,
    );

    run_steps(&mut runtime, 12);
    let left = runtime_entity(&runtime, "ball-left");
    let right = runtime_entity(&runtime, "ball-right");

    assert!(left.position.x < right.position.x);
    assert!(left.velocity.x <= 0.0);
    assert!(right.velocity.x >= 0.0);
}

#[test]
fn mechanics_regression_dynamic_blocks_do_not_tunnel_through_each_other() {
    let mut runtime = runtime_for_scene_with_gravity(
        vec![
            block(
                "block-left",
                vector2(-3.0, 0.0),
                (1.0, 1.0),
                vector2(10.0, 0.0),
                false,
                0.2,
                0.0,
            ),
            block(
                "block-right",
                vector2(0.0, 0.0),
                (1.0, 1.0),
                vector2(0.0, 0.0),
                false,
                0.2,
                0.0,
            ),
        ],
        Vector2::ZERO,
    );

    run_steps(&mut runtime, 10);
    let left = runtime_entity(&runtime, "block-left");
    let right = runtime_entity(&runtime, "block-right");
    let separation_x = (right.position.x - left.position.x).abs();

    assert!(left.position.x < right.position.x);
    assert!(separation_x >= 1.0 - 1e-6);
    assert!(right.velocity.x > 0.5);
}

#[test]
fn mechanics_regression_dynamic_support_stays_non_overlapping_under_falling_body() {
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
        block(
            "support",
            vector2(0.0, 1.0),
            (2.0, 1.0),
            vector2(0.0, 0.0),
            false,
            0.5,
            0.0,
        ),
        block(
            "falling",
            vector2(0.0, 4.0),
            (1.0, 1.0),
            vector2(0.0, 0.0),
            false,
            0.5,
            0.0,
        ),
    ]);

    run_steps(&mut runtime, 80);
    let support = runtime_entity(&runtime, "support");
    let falling = runtime_entity(&runtime, "falling");
    let vertical_gap = falling.position.y - support.position.y;
    let min_separation_y = 1.0;

    assert!(
        support.position.y >= 1.0 - 1e-6,
        "support_y={} support_velocity_y={}",
        support.position.y,
        support.velocity.y
    );
    assert!(
        vertical_gap >= min_separation_y - 5e-6,
        "vertical_gap={} min_separation_y={} support_y={} falling_y={} support_velocity_y={} falling_velocity_y={}",
        vertical_gap,
        min_separation_y,
        support.position.y,
        falling.position.y,
        support.velocity.y,
        falling.velocity.y
    );
    assert!(falling.velocity.y.abs() < 1.0);
}

#[test]
fn mechanics_regression_rotated_dynamic_block_does_not_tunnel_through_ground() {
    let rotation = std::f64::consts::FRAC_PI_4;
    let half_width = 0.6;
    let half_height = 0.3;
    let vertical_extent = half_width * rotation.sin().abs() + half_height * rotation.cos().abs();
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
        rotated_block(
            "block",
            vector2(0.0, 4.0),
            (1.2, 0.6),
            rotation,
            vector2(0.0, -1.0),
            false,
            0.4,
            0.0,
        ),
    ]);

    run_steps(&mut runtime, 80);
    let block = runtime_entity(&runtime, "block");
    let minimum_center_y = 0.5 + vertical_extent;

    assert!(
        block.position.y >= minimum_center_y - 1e-3,
        "block_y={} minimum_center_y={} block_velocity_y={}",
        block.position.y,
        minimum_center_y,
        block.velocity.y
    );
}
