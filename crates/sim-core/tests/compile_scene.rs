use sim_core::constraint::ConstraintDefinition;
use sim_core::entity::{EntityDefinition, ShapeDefinition, Vector2};
use sim_core::force::ForceSourceDefinition;
use sim_core::scene::{CompileSceneRequest, SceneCompileError, compile_scene};

fn vector2(x: f64, y: f64) -> Vector2 {
    Vector2::new(x, y)
}

fn dynamic_entity(id: &str, shape: ShapeDefinition) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape,
        position: vector2(0.0, 0.0),
        rotation_radians: 0.0,
        initial_velocity: vector2(0.0, 0.0),
        mass: 1.0,
        is_static: false,
        friction_coefficient: 0.4,
        restitution_coefficient: 0.2,
    }
}

#[test]
fn compile_scene_accepts_supported_entities_constraints_and_gravity() {
    let request = CompileSceneRequest {
        entities: vec![
            dynamic_entity(
                "block-1",
                ShapeDefinition::Block {
                    width: 2.0,
                    height: 1.0,
                },
            ),
            dynamic_entity(
                "polygon-1",
                ShapeDefinition::ConvexPolygon {
                    points: vec![
                        vector2(-1.0, -1.0),
                        vector2(1.0, -1.0),
                        vector2(1.0, 1.0),
                        vector2(-1.0, 1.0),
                    ],
                },
            ),
        ],
        constraints: vec![ConstraintDefinition::Spring {
            id: "spring-1".to_string(),
            entity_a: "block-1".to_string(),
            entity_b: "polygon-1".to_string(),
            rest_length: 2.0,
            stiffness: 12.0,
        }],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    };

    let compiled = compile_scene(&request).expect("expected supported scene to compile");

    assert_eq!(compiled.entities.len(), 2);
    assert_eq!(compiled.constraints.len(), 1);
    assert_eq!(compiled.gravity.acceleration, vector2(0.0, -9.81));
    assert_eq!(compiled.entities[1].id, "polygon-1");
}

#[test]
fn compile_scene_rejects_unsupported_shapes() {
    let request = CompileSceneRequest {
        entities: vec![dynamic_entity(
            "capsule-1",
            ShapeDefinition::Unsupported {
                kind: "capsule".to_string(),
            },
        )],
        constraints: vec![],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity-earth".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    };

    let error = compile_scene(&request).expect_err("unsupported shapes should fail");

    assert_eq!(
        error,
        SceneCompileError::UnsupportedShape {
            entity_id: "capsule-1".to_string(),
            kind: "capsule".to_string(),
        }
    );
}
