use crate::entity::Vector2;
use crate::solver::RuntimeBodyState;

#[derive(Debug, Clone, PartialEq)]
pub enum AnalyzerDefinition {
    Trajectory { id: String, entity_id: String },
}

impl AnalyzerDefinition {
    pub fn id(&self) -> &str {
        match self {
            Self::Trajectory { id, .. } => id,
        }
    }

    pub fn entity_id(&self) -> &str {
        match self {
            Self::Trajectory { entity_id, .. } => entity_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum CompiledAnalyzer {
    Trajectory { id: String, entity_id: String },
}

impl From<&AnalyzerDefinition> for CompiledAnalyzer {
    fn from(value: &AnalyzerDefinition) -> Self {
        match value {
            AnalyzerDefinition::Trajectory { id, entity_id } => Self::Trajectory {
                id: id.clone(),
                entity_id: entity_id.clone(),
            },
        }
    }
}

impl CompiledAnalyzer {
    pub fn id(&self) -> &str {
        match self {
            Self::Trajectory { id, .. } => id,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrajectorySample {
    pub frame_number: u64,
    pub time_seconds: f64,
    pub position: Vector2,
    pub velocity: Vector2,
    pub acceleration: Vector2,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrajectoryAnalyzerState {
    id: String,
    entity_id: String,
    samples: Vec<TrajectorySample>,
}

impl TrajectoryAnalyzerState {
    pub fn from_compiled(compiled: &CompiledAnalyzer) -> Self {
        match compiled {
            CompiledAnalyzer::Trajectory { id, entity_id } => Self {
                id: id.clone(),
                entity_id: entity_id.clone(),
                samples: Vec::new(),
            },
        }
    }

    pub fn id(&self) -> &str {
        self.id.as_str()
    }

    pub fn samples(&self) -> &[TrajectorySample] {
        self.samples.as_slice()
    }

    pub fn record(&mut self, frame_number: u64, time_seconds: f64, bodies: &[RuntimeBodyState]) {
        let Some(body) = bodies.iter().find(|body| body.entity_id == self.entity_id) else {
            return;
        };

        self.samples.push(TrajectorySample {
            frame_number,
            time_seconds,
            position: body.position,
            velocity: body.velocity,
            acceleration: body.acceleration,
        });
    }
}
