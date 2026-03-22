use crate::entity::Vector2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ForceSourceDefinition {
    Gravity { id: String, acceleration: Vector2 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct GravityForce {
    pub id: String,
    pub acceleration: Vector2,
}

impl ForceSourceDefinition {
    pub fn as_gravity(&self) -> GravityForce {
        match self {
            Self::Gravity { id, acceleration } => GravityForce {
                id: id.clone(),
                acceleration: *acceleration,
            },
        }
    }
}
