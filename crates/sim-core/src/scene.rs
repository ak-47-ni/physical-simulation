use std::collections::{HashMap, HashSet};

use crate::analyzer::{AnalyzerDefinition, CompiledAnalyzer};
use crate::arc_track::{
    ArcTrackCapturePolicy, ArcTrackEntityCompileMetadata, CompiledArcTrack,
    validated_arc_start_and_span,
};
use crate::constraint::ArcTrackSide;
use crate::constraint::{
    CompiledConstraint, ConstraintCompileError, ConstraintDefinition, compile_constraint,
};
use crate::entity::{
    CompiledEntity, CompiledShape, EntityDefinition, ShapeDefinition, is_convex_polygon,
};
use crate::force::{ForceSourceDefinition, GravityForce};
use crate::guide_network::{CompiledGuideNetwork, compile_guide_network};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    pub arc_tracks: Vec<CompiledArcTrack>,
    pub guide_network: CompiledGuideNetwork,
    pub gravity: GravityForce,
    pub analyzers: Vec<CompiledAnalyzer>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SceneCompileError {
    DuplicateEntityId {
        id: String,
    },
    InvalidSpringRestLength {
        constraint_id: String,
        value: f64,
    },
    InvalidSpringStiffness {
        constraint_id: String,
        value: f64,
    },
    InvalidShapeParameters {
        entity_id: String,
        kind: String,
    },
    InvalidTrackAxis {
        constraint_id: String,
    },
    InvalidArcTrackRadius {
        constraint_id: String,
        value: f64,
    },
    InvalidArcTrackSpan {
        constraint_id: String,
        start_angle_degrees: f64,
        end_angle_degrees: f64,
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

impl From<ConstraintCompileError> for SceneCompileError {
    fn from(value: ConstraintCompileError) -> Self {
        match value {
            ConstraintCompileError::InvalidSpringRestLength {
                constraint_id,
                value,
            } => Self::InvalidSpringRestLength {
                constraint_id,
                value,
            },
            ConstraintCompileError::InvalidSpringStiffness {
                constraint_id,
                value,
            } => Self::InvalidSpringStiffness {
                constraint_id,
                value,
            },
            ConstraintCompileError::InvalidTrackAxis { constraint_id } => {
                Self::InvalidTrackAxis { constraint_id }
            }
            ConstraintCompileError::InvalidArcTrackRadius {
                constraint_id,
                value,
            } => Self::InvalidArcTrackRadius {
                constraint_id,
                value,
            },
            ConstraintCompileError::InvalidArcTrackSpan {
                constraint_id,
                start_angle_degrees,
                end_angle_degrees,
            } => Self::InvalidArcTrackSpan {
                constraint_id,
                start_angle_degrees,
                end_angle_degrees,
            },
        }
    }
}

pub fn compile_scene(request: &CompileSceneRequest) -> Result<CompiledScene, SceneCompileError> {
    let mut entity_ids = HashSet::new();
    let mut compiled_entities = Vec::with_capacity(request.entities.len());
    let mut compiled_arc_tracks = Vec::new();

    for entity in &request.entities {
        if !entity_ids.insert(entity.id.clone()) {
            return Err(SceneCompileError::DuplicateEntityId {
                id: entity.id.clone(),
            });
        }

        match compile_entity(entity)? {
            CompiledSceneItem::Entity(compiled_entity) => compiled_entities.push(compiled_entity),
            CompiledSceneItem::ArcTrack(compiled_arc_track) => {
                compiled_arc_tracks.push(compiled_arc_track);
            }
        }
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
        compiled_constraints.push(compile_constraint(constraint).map_err(SceneCompileError::from)?);
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

    let guide_network = compile_guide_network(
        &compiled_entities,
        &compiled_constraints,
        &compiled_arc_tracks,
    );

    Ok(CompiledScene {
        entities: compiled_entities,
        constraints: compiled_constraints,
        arc_tracks: compiled_arc_tracks,
        guide_network,
        gravity,
        analyzers: compiled_analyzers,
    })
}

pub fn compile_scene_with_arc_track_metadata(
    request: &CompileSceneRequest,
    arc_track_metadata_by_id: &HashMap<String, ArcTrackEntityCompileMetadata>,
) -> Result<CompiledScene, SceneCompileError> {
    let mut compiled = compile_scene(request)?;

    for arc_track in &mut compiled.arc_tracks {
        let Some(metadata) = arc_track_metadata_by_id.get(&arc_track.id) else {
            continue;
        };

        arc_track.capture_policy = metadata.capture_policy();
        arc_track.anchor = metadata.anchor.clone();
    }

    compiled.guide_network = compile_guide_network(
        &compiled.entities,
        &compiled.constraints,
        &compiled.arc_tracks,
    );

    Ok(compiled)
}

enum CompiledSceneItem {
    Entity(CompiledEntity),
    ArcTrack(CompiledArcTrack),
}

fn compile_entity(entity: &EntityDefinition) -> Result<CompiledSceneItem, SceneCompileError> {
    let shape = match &entity.shape {
        ShapeDefinition::Ball { radius } => {
            if *radius <= 0.0 {
                return Err(SceneCompileError::InvalidShapeParameters {
                    entity_id: entity.id.clone(),
                    kind: "ball".to_string(),
                });
            }

            Some(CompiledShape::Ball { radius: *radius })
        }
        ShapeDefinition::ArcTrack {
            radius,
            central_angle_degrees,
            thickness,
        } => {
            if !radius.is_finite() || *radius <= 0.0 {
                return Err(SceneCompileError::InvalidArcTrackRadius {
                    constraint_id: entity.id.clone(),
                    value: *radius,
                });
            }

            let Some((start_angle_radians, end_angle_radians, span_radians)) =
                validated_arc_start_and_span(entity.rotation_radians, *central_angle_degrees)
            else {
                return Err(SceneCompileError::InvalidArcTrackSpan {
                    constraint_id: entity.id.clone(),
                    start_angle_degrees: entity.rotation_radians.to_degrees(),
                    end_angle_degrees: entity.rotation_radians.to_degrees()
                        + *central_angle_degrees,
                });
            };

            return Ok(CompiledSceneItem::ArcTrack(CompiledArcTrack {
                id: entity.id.clone(),
                center: entity.position,
                radius: *radius,
                thickness: *thickness,
                start_angle_radians,
                end_angle_radians,
                span_radians,
                side: ArcTrackSide::Inside,
                capture_policy: ArcTrackCapturePolicy::Either,
                anchor: None,
            }));
        }
        ShapeDefinition::Block { width, height } => {
            if *width <= 0.0 || *height <= 0.0 {
                return Err(SceneCompileError::InvalidShapeParameters {
                    entity_id: entity.id.clone(),
                    kind: "block".to_string(),
                });
            }

            Some(CompiledShape::Block {
                width: *width,
                height: *height,
            })
        }
        ShapeDefinition::ConvexPolygon { points } => {
            if !is_convex_polygon(points) {
                return Err(SceneCompileError::NonConvexPolygon {
                    entity_id: entity.id.clone(),
                });
            }

            Some(CompiledShape::ConvexPolygon {
                points: points.clone(),
            })
        }
        ShapeDefinition::Unsupported { kind } => {
            return Err(SceneCompileError::UnsupportedShape {
                entity_id: entity.id.clone(),
                kind: kind.clone(),
            });
        }
    };

    Ok(CompiledSceneItem::Entity(CompiledEntity {
        id: entity.id.clone(),
        shape: shape.expect("non-arc-track entities should produce a rigid shape"),
        position: entity.position,
        rotation_radians: entity.rotation_radians,
        initial_velocity: entity.initial_velocity,
        mass: entity.mass,
        is_static: entity.is_static,
        friction_coefficient: entity.friction_coefficient,
        restitution_coefficient: entity.restitution_coefficient,
    }))
}
