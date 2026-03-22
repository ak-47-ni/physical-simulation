use crate::analyzer::{CompiledAnalyzer, TrajectoryAnalyzerState, TrajectorySample};
use crate::entity::{CompiledShape, Vector2};
use crate::scene::CompiledScene;
use crate::solver::{RuntimeBodyState, step_bodies};

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeEntityFrame {
    pub entity_id: String,
    pub position: Vector2,
    pub rotation: f64,
    pub velocity: Vector2,
    pub acceleration: Vector2,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeFramePayload {
    pub frame_number: u64,
    pub entities: Vec<RuntimeEntityFrame>,
}

#[derive(Debug, Clone)]
pub struct RuntimeScene {
    baseline: Vec<RuntimeBodyState>,
    bodies: Vec<RuntimeBodyState>,
    constraints: Vec<crate::constraint::CompiledConstraint>,
    analyzer_blueprints: Vec<CompiledAnalyzer>,
    analyzers: Vec<TrajectoryAnalyzerState>,
    frame_number: u64,
    elapsed_time_seconds: f64,
    gravity: Vector2,
    fixed_delta_seconds: f64,
}

impl RuntimeScene {
    pub fn new(compiled: CompiledScene, fixed_delta_seconds: f64) -> Self {
        let gravity = compiled.gravity.acceleration;
        let baseline = compiled
            .entities
            .into_iter()
            .map(|entity| RuntimeBodyState {
                entity_id: entity.id,
                position: entity.position,
                half_extents: shape_half_extents(&entity.shape),
                rotation_radians: entity.rotation_radians,
                velocity: entity.initial_velocity,
                acceleration: if entity.is_static {
                    Vector2::ZERO
                } else {
                    gravity
                },
                mass: entity.mass,
                friction_coefficient: entity.friction_coefficient,
                restitution_coefficient: entity.restitution_coefficient,
                is_static: entity.is_static,
            })
            .collect::<Vec<_>>();
        let constraints = compiled.constraints;
        let analyzer_blueprints = compiled.analyzers;
        let mut analyzers = analyzer_blueprints
            .iter()
            .map(TrajectoryAnalyzerState::from_compiled)
            .collect::<Vec<_>>();

        record_analyzers(&mut analyzers, 0, 0.0, &baseline);

        Self {
            baseline: baseline.clone(),
            bodies: baseline,
            constraints,
            analyzer_blueprints,
            analyzers,
            frame_number: 0,
            elapsed_time_seconds: 0.0,
            gravity,
            fixed_delta_seconds: fixed_delta_seconds.max(f64::EPSILON),
        }
    }

    pub fn current_frame(&self) -> RuntimeFramePayload {
        RuntimeFramePayload {
            frame_number: self.frame_number,
            entities: self
                .bodies
                .iter()
                .map(|body| RuntimeEntityFrame {
                    entity_id: body.entity_id.clone(),
                    position: body.position,
                    rotation: body.rotation_radians,
                    velocity: body.velocity,
                    acceleration: body.acceleration,
                })
                .collect(),
        }
    }

    pub fn step(&mut self) -> RuntimeFramePayload {
        step_bodies(
            &mut self.bodies,
            &self.constraints,
            self.gravity,
            self.fixed_delta_seconds,
        );
        self.frame_number += 1;
        self.elapsed_time_seconds += self.fixed_delta_seconds;
        record_analyzers(
            &mut self.analyzers,
            self.frame_number,
            self.elapsed_time_seconds,
            &self.bodies,
        );
        self.current_frame()
    }

    pub fn reset(&mut self) -> RuntimeFramePayload {
        self.bodies = self.baseline.clone();
        self.frame_number = 0;
        self.elapsed_time_seconds = 0.0;
        self.analyzers = self
            .analyzer_blueprints
            .iter()
            .map(TrajectoryAnalyzerState::from_compiled)
            .collect();
        record_analyzers(&mut self.analyzers, 0, 0.0, &self.bodies);
        self.current_frame()
    }

    pub fn analyzer_samples(&self, id: &str) -> Option<&[TrajectorySample]> {
        self.analyzers
            .iter()
            .find(|analyzer| analyzer.id() == id)
            .map(TrajectoryAnalyzerState::samples)
    }
}

fn shape_half_extents(shape: &CompiledShape) -> Vector2 {
    match shape {
        CompiledShape::Ball { radius } => Vector2::new(*radius, *radius),
        CompiledShape::Block { width, height } => Vector2::new(*width * 0.5, *height * 0.5),
        CompiledShape::ConvexPolygon { points } => {
            let mut min_x = f64::INFINITY;
            let mut max_x = f64::NEG_INFINITY;
            let mut min_y = f64::INFINITY;
            let mut max_y = f64::NEG_INFINITY;

            for point in points {
                min_x = min_x.min(point.x);
                max_x = max_x.max(point.x);
                min_y = min_y.min(point.y);
                max_y = max_y.max(point.y);
            }

            Vector2::new((max_x - min_x) * 0.5, (max_y - min_y) * 0.5)
        }
    }
}

fn record_analyzers(
    analyzers: &mut [TrajectoryAnalyzerState],
    frame_number: u64,
    time_seconds: f64,
    bodies: &[RuntimeBodyState],
) {
    for analyzer in analyzers {
        analyzer.record(frame_number, time_seconds, bodies);
    }
}
