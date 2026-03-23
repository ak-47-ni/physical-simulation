use sim_core::constraint::ConstraintDefinition;
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::scene::{CompileSceneRequest, SceneCompileError, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn dynamic_block(id: &str, position: Vector2) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Block {
            width: 1.0,
            height: 1.0,
        },
        position,
        rotation_radians: 0.0,
        initial_velocity: Vector2::ZERO,
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.2,
        restitution_coefficient: 0.1,
    }
}

fn compile_request(constraints: Vec<ConstraintDefinition>) -> CompileSceneRequest {
    CompileSceneRequest {
        entities: vec![
            dynamic_block("anchor", vector2(0.0, 0.0)),
            dynamic_block("slider", vector2(5.0, 2.0)),
        ],
        constraints,
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    }
}

#[test]
fn constraint_compile_accepts_valid_typed_spring_and_track_constraints() {
    let request = compile_request(vec![
        ConstraintDefinition::Spring {
            id: "spring-1".to_string(),
            entity_a: "anchor".to_string(),
            entity_b: "slider".to_string(),
            rest_length: 3.0,
            stiffness: 9.0,
        },
        ConstraintDefinition::Track {
            id: "track-1".to_string(),
            entity_id: "slider".to_string(),
            origin: vector2(0.0, 1.0),
            axis: vector2(1.0, 0.0),
        },
    ]);

    let compiled = compile_scene(&request).expect("valid typed constraints should compile");

    assert_eq!(compiled.constraints.len(), 2);
}

#[test]
fn constraint_compile_rejects_non_positive_spring_rest_length() {
    let request = compile_request(vec![ConstraintDefinition::Spring {
        id: "spring-1".to_string(),
        entity_a: "anchor".to_string(),
        entity_b: "slider".to_string(),
        rest_length: 0.0,
        stiffness: 9.0,
    }]);

    let error = compile_scene(&request).expect_err("rest length must be positive");

    assert_eq!(
        error,
        SceneCompileError::InvalidSpringRestLength {
            constraint_id: "spring-1".to_string(),
            value: 0.0,
        }
    );
}

#[test]
fn constraint_compile_rejects_non_positive_spring_stiffness() {
    let request = compile_request(vec![ConstraintDefinition::Spring {
        id: "spring-1".to_string(),
        entity_a: "anchor".to_string(),
        entity_b: "slider".to_string(),
        rest_length: 3.0,
        stiffness: -1.0,
    }]);

    let error = compile_scene(&request).expect_err("stiffness must be positive");

    assert_eq!(
        error,
        SceneCompileError::InvalidSpringStiffness {
            constraint_id: "spring-1".to_string(),
            value: -1.0,
        }
    );
}

#[test]
fn constraint_compile_rejects_zero_length_track_axis() {
    let request = compile_request(vec![ConstraintDefinition::Track {
        id: "track-1".to_string(),
        entity_id: "slider".to_string(),
        origin: vector2(0.0, 1.0),
        axis: Vector2::ZERO,
    }]);

    let error = compile_scene(&request).expect_err("track axis must be non-zero");

    assert_eq!(
        error,
        SceneCompileError::InvalidTrackAxis {
            constraint_id: "track-1".to_string(),
        }
    );
}

#[test]
fn constraint_compile_rejects_unknown_constraint_entity_ids() {
    let request = compile_request(vec![ConstraintDefinition::Track {
        id: "track-1".to_string(),
        entity_id: "missing-slider".to_string(),
        origin: vector2(0.0, 1.0),
        axis: vector2(1.0, 0.0),
    }]);

    let error = compile_scene(&request).expect_err("unknown entity ids must fail");

    assert_eq!(
        error,
        SceneCompileError::UnknownConstraintEntity {
            constraint_id: "track-1".to_string(),
            entity_id: "missing-slider".to_string(),
        }
    );
}
