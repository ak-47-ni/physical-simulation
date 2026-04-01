use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArcTrackSide {
    Inside,
    Outside,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArcTrackEntryEndpoint {
    Start,
    End,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConstraintDefinition {
    Spring {
        id: String,
        entity_a: String,
        entity_b: String,
        rest_length: f64,
        stiffness: f64,
    },
    Track {
        id: String,
        entity_id: String,
        origin: crate::entity::Vector2,
        axis: crate::entity::Vector2,
    },
    ArcTrack {
        id: String,
        center: crate::entity::Vector2,
        radius: f64,
        start_angle_degrees: f64,
        end_angle_degrees: f64,
        side: ArcTrackSide,
        entry_endpoint: ArcTrackEntryEndpoint,
    },
}

impl ConstraintDefinition {
    pub fn id(&self) -> &str {
        match self {
            Self::Spring { id, .. } => id,
            Self::Track { id, .. } => id,
            Self::ArcTrack { id, .. } => id,
        }
    }

    pub fn entity_ids(&self) -> Vec<&str> {
        match self {
            Self::Spring {
                entity_a, entity_b, ..
            } => vec![entity_a, entity_b],
            Self::Track { entity_id, .. } => vec![entity_id],
            Self::ArcTrack { .. } => vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ConstraintCompileError {
    InvalidSpringRestLength {
        constraint_id: String,
        value: f64,
    },
    InvalidSpringStiffness {
        constraint_id: String,
        value: f64,
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
}

#[derive(Debug, Clone, PartialEq)]
pub enum CompiledConstraint {
    Spring {
        id: String,
        entity_a: String,
        entity_b: String,
        rest_length: f64,
        stiffness: f64,
    },
    Track {
        id: String,
        entity_id: String,
        origin: crate::entity::Vector2,
        axis: crate::entity::Vector2,
    },
    ArcTrack {
        id: String,
        center: crate::entity::Vector2,
        radius: f64,
        start_angle_radians: f64,
        end_angle_radians: f64,
        span_radians: f64,
        side: ArcTrackSide,
        entry_endpoint: ArcTrackEntryEndpoint,
    },
}

pub fn compile_constraint(
    definition: &ConstraintDefinition,
) -> Result<CompiledConstraint, ConstraintCompileError> {
    match definition {
        ConstraintDefinition::Spring {
            id,
            entity_a,
            entity_b,
            rest_length,
            stiffness,
        } => {
            if !rest_length.is_finite() || *rest_length <= 0.0 {
                return Err(ConstraintCompileError::InvalidSpringRestLength {
                    constraint_id: id.clone(),
                    value: *rest_length,
                });
            }

            if !stiffness.is_finite() || *stiffness <= 0.0 {
                return Err(ConstraintCompileError::InvalidSpringStiffness {
                    constraint_id: id.clone(),
                    value: *stiffness,
                });
            }

            Ok(CompiledConstraint::Spring {
                id: id.clone(),
                entity_a: entity_a.clone(),
                entity_b: entity_b.clone(),
                rest_length: *rest_length,
                stiffness: *stiffness,
            })
        }
        ConstraintDefinition::Track {
            id,
            entity_id,
            origin,
            axis,
        } => {
            if !axis.x.is_finite() || !axis.y.is_finite() || axis.length() <= f64::EPSILON {
                return Err(ConstraintCompileError::InvalidTrackAxis {
                    constraint_id: id.clone(),
                });
            }

            Ok(CompiledConstraint::Track {
                id: id.clone(),
                entity_id: entity_id.clone(),
                origin: *origin,
                axis: *axis,
            })
        }
        ConstraintDefinition::ArcTrack {
            id,
            center,
            radius,
            start_angle_degrees,
            end_angle_degrees,
            side,
            entry_endpoint,
        } => {
            if !radius.is_finite() || *radius <= 0.0 {
                return Err(ConstraintCompileError::InvalidArcTrackRadius {
                    constraint_id: id.clone(),
                    value: *radius,
                });
            }

            let Some((start_angle_radians, end_angle_radians, span_radians)) =
                crate::arc_track::validated_arc_angles(*start_angle_degrees, *end_angle_degrees)
            else {
                return Err(ConstraintCompileError::InvalidArcTrackSpan {
                    constraint_id: id.clone(),
                    start_angle_degrees: *start_angle_degrees,
                    end_angle_degrees: *end_angle_degrees,
                });
            };

            Ok(CompiledConstraint::ArcTrack {
                id: id.clone(),
                center: *center,
                radius: *radius,
                start_angle_radians,
                end_angle_radians,
                span_radians,
                side: *side,
                entry_endpoint: *entry_endpoint,
            })
        }
    }
}
