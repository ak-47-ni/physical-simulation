use sim_core::analyzer::AnalyzerDefinition;
use sim_core::constraint::ConstraintDefinition;
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
        friction_coefficient: 0.2,
        restitution_coefficient: 0.0,
    }
}

fn runtime_for_scene(
    entities: Vec<EntityDefinition>,
    constraints: Vec<ConstraintDefinition>,
    analyzers: Vec<AnalyzerDefinition>,
    gravity: Vector2,
) -> RuntimeScene {
    let compiled = compile_scene(&CompileSceneRequest {
        entities,
        constraints,
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: gravity,
        }],
        analyzers,
    })
    .expect("scene should compile");

    RuntimeScene::new(compiled, 0.1)
}

#[test]
fn constraint_behaviors_spring_constant_changes_motion_response() {
    let anchor = block(
        "anchor",
        vector2(0.0, 0.0),
        (1.0, 1.0),
        vector2(0.0, 0.0),
        true,
    );
    let payload = block(
        "payload",
        vector2(10.0, 0.0),
        (1.0, 1.0),
        vector2(0.0, 0.0),
        false,
    );

    let mut soft_spring = runtime_for_scene(
        vec![anchor.clone(), payload.clone()],
        vec![ConstraintDefinition::Spring {
            id: "spring-soft".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "payload".to_string(),
            rest_length: 2.0,
            stiffness: 1.0,
        }],
        vec![],
        vector2(0.0, 0.0),
    );
    let mut stiff_spring = runtime_for_scene(
        vec![anchor, payload],
        vec![ConstraintDefinition::Spring {
            id: "spring-stiff".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "payload".to_string(),
            rest_length: 2.0,
            stiffness: 6.0,
        }],
        vec![],
        vector2(0.0, 0.0),
    );

    for _ in 0..10 {
        soft_spring.step();
        stiff_spring.step();
    }

    let soft_x = soft_spring.current_frame().entities[1].position.x;
    let stiff_x = stiff_spring.current_frame().entities[1].position.x;

    assert!(stiff_x < soft_x);
}

#[test]
fn constraint_behaviors_track_binding_keeps_an_entity_on_track() {
    let mut runtime = runtime_for_scene(
        vec![block(
            "slider",
            vector2(0.0, 4.0),
            (1.0, 1.0),
            vector2(3.0, 2.0),
            false,
        )],
        vec![ConstraintDefinition::Track {
            id: "track-horizontal".to_string(),
            entity_id: "slider".to_string(),
            origin: vector2(0.0, 1.0),
            axis: vector2(1.0, 0.0),
        }],
        vec![],
        vector2(0.0, -9.81),
    );

    for _ in 0..20 {
        runtime.step();
    }

    let slider = &runtime.current_frame().entities[0];
    assert!((slider.position.y - 1.0).abs() < 1e-6);
    assert!(slider.position.x > 0.0);
    assert!(slider.velocity.y.abs() < 1e-6);
}

#[test]
fn constraint_behaviors_analyzer_receives_trajectory_samples_over_time() {
    let mut runtime = runtime_for_scene(
        vec![block(
            "probe",
            vector2(0.0, 3.0),
            (1.0, 1.0),
            vector2(2.0, 0.0),
            false,
        )],
        vec![],
        vec![AnalyzerDefinition::Trajectory {
            id: "traj-1".to_string(),
            entity_id: "probe".to_string(),
        }],
        vector2(0.0, -9.81),
    );

    runtime.step();
    runtime.step();

    let samples = runtime
        .analyzer_samples("traj-1")
        .expect("trajectory analyzer should exist");

    assert!(samples.len() >= 3);
    assert_eq!(samples[0].frame_number, 0);
    assert_eq!(samples.last().expect("sample").frame_number, 2);
    assert!(samples.last().expect("sample").position.x > samples[0].position.x);
}
