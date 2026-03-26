use std::f64::consts::FRAC_PI_6;

use serde_json::json;
use sim_core::bridge::{RuntimeCompileRequest, SimulationBridge};
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::{RuntimeEntityFrame, RuntimeScene};
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn box_extent_along_axis(size: (f64, f64), rotation_radians: f64, axis: Vector2) -> f64 {
    let half_width = size.0 * 0.5;
    let half_height = size.1 * 0.5;
    let axis_x = vector2(rotation_radians.cos(), rotation_radians.sin());
    let axis_y = vector2(-rotation_radians.sin(), rotation_radians.cos());

    half_width * axis.dot(axis_x).abs() + half_height * axis.dot(axis_y).abs()
}

fn board(
    id: &str,
    position: Vector2,
    size: (f64, f64),
    friction: f64,
    rotation_radians: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: size.0,
            height: size.1,
        },
        position,
        rotation_radians,
        initial_velocity: Vector2::ZERO,
        mass: 0.0,
        is_static: true,
        friction_coefficient: friction,
        restitution_coefficient: 0.0,
    }
}

fn ball(
    id: &str,
    position: Vector2,
    radius: f64,
    initial_velocity: Vector2,
    friction: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius },
        position,
        rotation_radians: 0.0,
        initial_velocity,
        mass: 1.0,
        is_static: false,
        friction_coefficient: friction,
        restitution_coefficient: 0.0,
    }
}

fn dynamic_block(
    id: &str,
    position: Vector2,
    size: (f64, f64),
    rotation_radians: f64,
    friction: f64,
) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: size.0,
            height: size.1,
        },
        position,
        rotation_radians,
        initial_velocity: Vector2::ZERO,
        mass: 1.0,
        is_static: false,
        friction_coefficient: friction,
        restitution_coefficient: 0.0,
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
fn tilted_board_regression_bridge_consumes_rotation_radians_payload() {
    let request: RuntimeCompileRequest = serde_json::from_value(json!({
        "scene": {
            "schemaVersion": 1,
            "entities": [
                {
                    "id": "board-1",
                    "kind": "board",
                    "x": 120.0,
                    "y": 240.0,
                    "width": 160.0,
                    "height": 20.0,
                    "locked": true,
                    "rotationRadians": FRAC_PI_6
                }
            ],
            "constraints": [],
            "forceSources": [
                {
                    "id": "gravity-1",
                    "kind": "gravity",
                    "acceleration": { "x": 0.0, "y": -9.81 }
                }
            ],
            "analyzers": [],
            "annotations": []
        },
        "dirtyScopes": ["physics"],
        "rebuildRequired": true
    }))
    .expect("compile request should deserialize");

    let frame = SimulationBridge::new(1.0 / 60.0)
        .compile_runtime_request(request)
        .expect("compile request should build a runtime frame");

    assert!((frame.entities[0].rotation - FRAC_PI_6).abs() <= 1e-9);
}

#[test]
fn tilted_board_regression_ball_slides_along_locked_incline() {
    let rotation = FRAC_PI_6;
    let board_half_height = 0.25;
    let ball_radius = 0.4;
    let tangent = vector2(rotation.cos(), rotation.sin());
    let normal = vector2(-rotation.sin(), rotation.cos());
    let board_position = vector2(4.0, 2.0);
    let initial_ball_position = board_position
        .add(tangent.scale(1.5))
        .add(normal.scale(board_half_height + ball_radius - 0.02));
    let mut runtime = runtime_for_scene(vec![
        board("board", board_position, (8.0, 0.5), 0.05, rotation),
        ball(
            "ball",
            initial_ball_position,
            ball_radius,
            Vector2::ZERO,
            0.05,
        ),
    ]);

    run_steps(&mut runtime, 12);
    let ball = runtime_entity(&runtime, "ball");
    let local = ball.position.sub(board_position);
    let local_normal_distance = local.dot(normal);

    assert!(ball.position.x < initial_ball_position.x - 0.2);
    assert!(ball.velocity.x < -0.2);
    assert!(local_normal_distance >= board_half_height + ball_radius - 0.03);
}

#[test]
fn tilted_board_regression_exact_contact_block_slides_without_opening_a_gap() {
    let rotation = FRAC_PI_6;
    let board_half_height = 0.25;
    let block_size = (1.2, 0.6);
    let tangent = vector2(rotation.cos(), rotation.sin());
    let normal = vector2(-rotation.sin(), rotation.cos());
    let board_position = vector2(4.0, 2.0);
    let initial_tangent_distance = 1.5;
    let initial_block_normal_extent = box_extent_along_axis(block_size, rotation, normal);
    let initial_block_position = board_position
        .add(tangent.scale(initial_tangent_distance))
        .add(normal.scale(board_half_height + initial_block_normal_extent));
    let mut runtime = runtime_for_scene(vec![
        board("board", board_position, (8.0, 0.5), 0.05, rotation),
        dynamic_block("block", initial_block_position, block_size, rotation, 0.05),
    ]);

    run_steps(&mut runtime, 12);
    let block = runtime_entity(&runtime, "block");
    let local = block.position.sub(board_position);
    let local_tangent = local.dot(tangent);
    let local_normal_distance = local.dot(normal);
    let block_normal_extent = box_extent_along_axis(block_size, block.rotation, normal);
    let contact_gap = local_normal_distance - (board_half_height + block_normal_extent);

    assert!(
        local_tangent < initial_tangent_distance - 0.1,
        "expected block to slide down the incline, got local_tangent={}",
        local_tangent
    );
    assert!(
        contact_gap >= -0.05,
        "expected block to stay non-penetrating, got contact_gap={} local_normal_distance={} block_rotation={}",
        contact_gap,
        local_normal_distance,
        block.rotation
    );
    assert!(
        contact_gap <= 0.05,
        "expected block to stay near exact contact instead of floating, got contact_gap={} local_normal_distance={} block_rotation={}",
        contact_gap,
        local_normal_distance,
        block.rotation
    );
}

#[test]
fn tilted_board_regression_locked_support_sliding_does_not_flip_block_upward() {
    let rotation = FRAC_PI_6;
    let board_half_height = 0.25;
    let block_size = (1.2, 0.6);
    let tangent = vector2(rotation.cos(), rotation.sin());
    let normal = vector2(-rotation.sin(), rotation.cos());
    let board_position = vector2(4.0, 2.0);
    let initial_block_position = board_position
        .add(tangent.scale(2.0))
        .add(normal.scale(board_half_height + box_extent_along_axis(block_size, rotation, normal)));
    let mut runtime = runtime_for_scene(vec![
        board("board", board_position, (8.0, 0.5), 0.1, rotation),
        dynamic_block("block", initial_block_position, block_size, rotation, 0.1),
    ]);

    run_steps(&mut runtime, 48);
    let block = runtime_entity(&runtime, "block");
    let local = block.position.sub(board_position);
    let local_normal_distance = local.dot(normal);
    let block_normal_extent = box_extent_along_axis(block_size, block.rotation, normal);
    let contact_gap = local_normal_distance - (board_half_height + block_normal_extent);
    let rotation_delta = (block.rotation - rotation).abs();

    assert!(
        block.position.x < initial_block_position.x - 0.6,
        "expected support sliding to keep moving down the incline, got x={} initial_x={}",
        block.position.x,
        initial_block_position.x
    );
    assert!(
        contact_gap.abs() <= 0.06,
        "expected locked support sliding to stay in contact, got contact_gap={} rotation={}",
        contact_gap,
        block.rotation
    );
    assert!(
        rotation_delta <= 0.2,
        "expected support contact to avoid self-flipping, got rotation={} board_rotation={} delta={}",
        block.rotation,
        rotation,
        rotation_delta
    );
}
