use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::runtime::RuntimeScene;
use sim_core::scene::{CompileSceneRequest, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn moving_block() -> EntityDefinition {
    EntityDefinition {
        id: "block-1".to_string(),
        shape: ShapeDefinition::Block {
            width: 2.0,
            height: 1.0,
        },
        position: vector2(0.0, 10.0),
        rotation_radians: 0.0,
        initial_velocity: vector2(5.0, 3.0),
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.1,
        restitution_coefficient: 0.2,
    }
}

fn compile_runtime_scene() -> sim_core::scene::CompiledScene {
    compile_scene(&CompileSceneRequest {
        entities: vec![moving_block()],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    })
    .expect("expected supported scene to compile")
}

#[test]
fn stepping_applies_initial_velocity_and_gravity() {
    let compiled = compile_runtime_scene();
    let mut runtime = RuntimeScene::new(compiled, 0.5);

    let initial = runtime.current_frame();
    let stepped = runtime.step();

    assert_eq!(initial.frame_number, 0);
    assert_eq!(initial.entities[0].entity_id, "block-1");
    assert_eq!(stepped.frame_number, 1);
    assert!(stepped.entities[0].position.x > initial.entities[0].position.x);
    assert!(stepped.entities[0].position.y < initial.entities[0].position.y + 2.0);
    assert!(stepped.entities[0].velocity.y < initial.entities[0].velocity.y);
}

#[test]
fn stepping_reset_restores_the_compiled_baseline() {
    let compiled = compile_runtime_scene();
    let baseline = RuntimeScene::new(compiled.clone(), 0.25).current_frame();
    let mut runtime = RuntimeScene::new(compiled, 0.25);

    runtime.step();
    runtime.step();
    let reset = runtime.reset();

    assert_eq!(reset, baseline);
}
