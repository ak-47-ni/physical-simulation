use serde::{Deserialize, Serialize};

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
}

impl ConstraintDefinition {
    pub fn id(&self) -> &str {
        match self {
            Self::Spring { id, .. } => id,
            Self::Track { id, .. } => id,
        }
    }

    pub fn entity_ids(&self) -> Vec<&str> {
        match self {
            Self::Spring {
                entity_a, entity_b, ..
            } => vec![entity_a, entity_b],
            Self::Track { entity_id, .. } => vec![entity_id],
        }
    }
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
}

impl From<&ConstraintDefinition> for CompiledConstraint {
    fn from(value: &ConstraintDefinition) -> Self {
        match value {
            ConstraintDefinition::Spring {
                id,
                entity_a,
                entity_b,
                rest_length,
                stiffness,
            } => Self::Spring {
                id: id.clone(),
                entity_a: entity_a.clone(),
                entity_b: entity_b.clone(),
                rest_length: *rest_length,
                stiffness: *stiffness,
            },
            ConstraintDefinition::Track {
                id,
                entity_id,
                origin,
                axis,
            } => Self::Track {
                id: id.clone(),
                entity_id: entity_id.clone(),
                origin: *origin,
                axis: *axis,
            },
        }
    }
}
