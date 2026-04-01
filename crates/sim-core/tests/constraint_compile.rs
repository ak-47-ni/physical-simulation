use sim_core::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, ConstraintDefinition};
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

fn dynamic_ball(id: &str, position: Vector2) -> EntityDefinition {
    EntityDefinition {
        id: id.to_string(),
        shape: ShapeDefinition::Ball { radius: 0.5 },
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
            dynamic_ball("slider", vector2(5.0, 2.0)),
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
fn constraint_compile_accepts_valid_typed_spring_track_and_arc_track_constraints() {
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
        ConstraintDefinition::ArcTrack {
            id: "arc-track-1".to_string(),
            center: vector2(2.0, 2.0),
            radius: 3.0,
            start_angle_degrees: 180.0,
            end_angle_degrees: 315.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::Start,
        },
    ]);

    let compiled = compile_scene(&request).expect("valid typed constraints should compile");

    assert_eq!(compiled.constraints.len(), 3);
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

#[test]
fn constraint_compile_rejects_non_positive_arc_track_radius() {
    let request = compile_request(vec![ConstraintDefinition::ArcTrack {
        id: "arc-track-1".to_string(),
        center: vector2(2.0, 2.0),
        radius: 0.0,
        start_angle_degrees: 180.0,
        end_angle_degrees: 315.0,
        side: ArcTrackSide::Inside,
        entry_endpoint: ArcTrackEntryEndpoint::Start,
    }]);

    let error = compile_scene(&request).expect_err("arc-track radius must be positive");

    assert_eq!(
        error,
        SceneCompileError::InvalidArcTrackRadius {
            constraint_id: "arc-track-1".to_string(),
            value: 0.0,
        }
    );
}

#[test]
fn constraint_compile_rejects_zero_and_full_circle_arc_track_spans() {
    let zero_span_request = compile_request(vec![ConstraintDefinition::ArcTrack {
        id: "arc-track-zero".to_string(),
        center: vector2(2.0, 2.0),
        radius: 3.0,
        start_angle_degrees: 90.0,
        end_angle_degrees: 90.0,
        side: ArcTrackSide::Inside,
        entry_endpoint: ArcTrackEntryEndpoint::Start,
    }]);
    let full_circle_request = compile_request(vec![ConstraintDefinition::ArcTrack {
        id: "arc-track-full".to_string(),
        center: vector2(2.0, 2.0),
        radius: 3.0,
        start_angle_degrees: 0.0,
        end_angle_degrees: 360.0,
        side: ArcTrackSide::Inside,
        entry_endpoint: ArcTrackEntryEndpoint::End,
    }]);

    assert_eq!(
        compile_scene(&zero_span_request),
        Err(SceneCompileError::InvalidArcTrackSpan {
            constraint_id: "arc-track-zero".to_string(),
            start_angle_degrees: 90.0,
            end_angle_degrees: 90.0,
        })
    );
    assert_eq!(
        compile_scene(&full_circle_request),
        Err(SceneCompileError::InvalidArcTrackSpan {
            constraint_id: "arc-track-full".to_string(),
            start_angle_degrees: 0.0,
            end_angle_degrees: 360.0,
        })
    );
}

#[test]
fn constraint_compile_accepts_arc_track_scene_segments_without_ball_entities() {
    let request = CompileSceneRequest {
        entities: vec![
            dynamic_block("anchor", vector2(0.0, 0.0)),
            dynamic_block("slider", vector2(5.0, 2.0)),
        ],
        constraints: vec![ConstraintDefinition::ArcTrack {
            id: "arc-track-1".to_string(),
            center: vector2(2.0, 2.0),
            radius: 3.0,
            start_angle_degrees: 180.0,
            end_angle_degrees: 315.0,
            side: ArcTrackSide::Inside,
            entry_endpoint: ArcTrackEntryEndpoint::End,
        }],
        force_sources: vec![ForceSourceDefinition::Gravity {
            id: "gravity".to_string(),
            acceleration: vector2(0.0, -9.81),
        }],
        analyzers: vec![],
    };

    let compiled =
        compile_scene(&request).expect("arc-track should compile without any ball binding");

    assert_eq!(compiled.constraints.len(), 1);
}
