use std::collections::HashSet;

use crate::analyzer::{AnalyzerDefinition, CompiledAnalyzer};
use crate::constraint::{CompiledConstraint, ConstraintDefinition};
use crate::entity::{
    CompiledEntity, CompiledShape, EntityDefinition, ShapeDefinition, is_convex_polygon,
};
use crate::force::{ForceSourceDefinition, GravityForce};

#[derive(Debug, Clone, PartialEq)]
pub struct CompileSceneRequest {
    pub entities: Vec<EntityDefinition>,
    pub constraints: Vec<ConstraintDefinition>,
    pub force_sources: Vec<ForceSourceDefinition>,
    pub analyzers: Vec<AnalyzerDefinition>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledScene {
    pub entities: Vec<CompiledEntity>,
    pub constraints: Vec<CompiledConstraint>,
    pub gravity: GravityForce,
    pub analyzers: Vec<CompiledAnalyzer>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SceneCompileError {
    DuplicateEntityId {
        id: String,
    },
    InvalidShapeParameters {
        entity_id: String,
        kind: String,
    },
    MissingGravity,
    NonConvexPolygon {
        entity_id: String,
    },
    UnknownConstraintEntity {
        constraint_id: String,
        entity_id: String,
    },
    UnknownAnalyzerEntity {
        analyzer_id: String,
        entity_id: String,
    },
    UnsupportedShape {
        entity_id: String,
        kind: String,
    },
}

pub fn compile_scene(request: &CompileSceneRequest) -> Result<CompiledScene, SceneCompileError> {
    let mut entity_ids = HashSet::new();
    let mut compiled_entities = Vec::with_capacity(request.entities.len());

    for entity in &request.entities {
        if !entity_ids.insert(entity.id.clone()) {
            return Err(SceneCompileError::DuplicateEntityId {
                id: entity.id.clone(),
            });
        }

        compiled_entities.push(compile_entity(entity)?);
    }

    let gravity = request
        .force_sources
        .iter()
        .find_map(|force| match force {
            ForceSourceDefinition::Gravity { .. } => Some(force.as_gravity()),
        })
        .ok_or(SceneCompileError::MissingGravity)?;

    let mut compiled_constraints = Vec::with_capacity(request.constraints.len());

    for constraint in &request.constraints {
        for entity_id in constraint.entity_ids() {
            if !entity_ids.contains(entity_id) {
                return Err(SceneCompileError::UnknownConstraintEntity {
                    constraint_id: constraint.id().to_string(),
                    entity_id: entity_id.to_string(),
                });
            }
        }

        compiled_constraints.push(CompiledConstraint::from(constraint));
    }

    let mut compiled_analyzers = Vec::with_capacity(request.analyzers.len());

    for analyzer in &request.analyzers {
        if !entity_ids.contains(analyzer.entity_id()) {
            return Err(SceneCompileError::UnknownAnalyzerEntity {
                analyzer_id: analyzer.id().to_string(),
                entity_id: analyzer.entity_id().to_string(),
            });
        }

        compiled_analyzers.push(CompiledAnalyzer::from(analyzer));
    }

    Ok(CompiledScene {
        entities: compiled_entities,
        constraints: compiled_constraints,
        gravity,
        analyzers: compiled_analyzers,
    })
}

fn compile_entity(entity: &EntityDefinition) -> Result<CompiledEntity, SceneCompileError> {
    let shape = match &entity.shape {
        ShapeDefinition::Ball { radius } => {
            if *radius <= 0.0 {
                return Err(SceneCompileError::InvalidShapeParameters {
                    entity_id: entity.id.clone(),
                    kind: "ball".to_string(),
                });
            }

            CompiledShape::Ball { radius: *radius }
        }
        ShapeDefinition::Block { width, height } => {
            if *width <= 0.0 || *height <= 0.0 {
                return Err(SceneCompileError::InvalidShapeParameters {
                    entity_id: entity.id.clone(),
                    kind: "block".to_string(),
                });
            }

            CompiledShape::Block {
                width: *width,
                height: *height,
            }
        }
        ShapeDefinition::ConvexPolygon { points } => {
            if !is_convex_polygon(points) {
                return Err(SceneCompileError::NonConvexPolygon {
                    entity_id: entity.id.clone(),
                });
            }

            CompiledShape::ConvexPolygon {
                points: points.clone(),
            }
        }
        ShapeDefinition::Unsupported { kind } => {
            return Err(SceneCompileError::UnsupportedShape {
                entity_id: entity.id.clone(),
                kind: kind.clone(),
            });
        }
    };

    Ok(CompiledEntity {
        id: entity.id.clone(),
        shape,
        position: entity.position,
        rotation_radians: entity.rotation_radians,
        initial_velocity: entity.initial_velocity,
        mass: entity.mass,
        is_static: entity.is_static,
        friction_coefficient: entity.friction_coefficient,
        restitution_coefficient: entity.restitution_coefficient,
    })
}
