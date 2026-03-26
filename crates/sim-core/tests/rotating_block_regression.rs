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
fn rotating_block_regression_off_center_impact_changes_block_rotation() {
    let mut runtime = runtime_for_scene_with_gravity(
        vec![
            block(
                "block",
                vector2(0.0, 0.0),
                (1.2, 0.8),
                0.0,
                Vector2::ZERO,
                false,
                0.2,
                0.1,
            ),
            ball(
                "ball",
                vector2(-3.0, 0.3),
                0.25,
                vector2(9.0, 0.0),
                0.2,
            ),
        ],
        Vector2::ZERO,
    );

    for _ in 0..20 {
        runtime.step();
    }

    let block = runtime_entity(&runtime, "block");
    assert!(
        block.rotation.abs() > 1e-3,
        "expected off-center contact to rotate the block, got rotation={}",
        block.rotation
    );
}

#[test]
fn rotating_block_regression_runtime_frames_show_block_rotation_changing_over_time() {
    let mut runtime = runtime_for_scene_with_gravity(
        vec![
            block(
                "block",
                vector2(0.0, 0.0),
                (1.2, 0.8),
                0.0,
                Vector2::ZERO,
                false,
                0.2,
                0.1,
            ),
            ball(
                "ball",
                vector2(-3.0, 0.3),
                0.25,
                vector2(9.0, 0.0),
                0.2,
            ),
        ],
        Vector2::ZERO,
    );

    let mut observed_rotations = vec![runtime_entity(&runtime, "block").rotation];

    for _ in 0..20 {
        runtime.step();
        observed_rotations.push(runtime_entity(&runtime, "block").rotation);
    }

    let first_rotation = observed_rotations[0];
    let max_delta = observed_rotations
        .iter()
        .map(|rotation| (rotation - first_rotation).abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_delta > 1e-3,
        "expected runtime frames to report changing block rotation, got {:?}",
        observed_rotations
    );
}
