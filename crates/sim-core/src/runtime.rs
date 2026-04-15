#[path = "contact_budget.rs"]
mod contact_budget;

#[path = "contact_substeps.rs"]
mod contact_substeps;

use std::collections::HashMap;

use crate::analyzer::{CompiledAnalyzer, TrajectoryAnalyzerState, TrajectorySample};
use crate::arc_track::{
    CompiledArcTrack, compiled_arc_track_from_constraint, validated_arc_start_and_span,
};
use crate::entity::{CompiledShape, Vector2};
use crate::scene::CompiledScene;
use crate::solver::{
    RuntimeArcTrackAttachment, RuntimeArcTrackGeometry, RuntimeBodyShape, RuntimeBodyState,
    inverse_inertia_for_body, project_track_bindings, step_bodies,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEntityFrame {
    pub entity_id: String,
    pub position: Vector2,
    pub rotation: f64,
    pub velocity: Vector2,
    pub acceleration: Vector2,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFramePayload {
    pub frame_number: u64,
    pub entities: Vec<RuntimeEntityFrame>,
}

#[derive(Debug, Clone)]
pub struct RuntimeScene {
    baseline: Vec<RuntimeBodyState>,
    bodies: Vec<RuntimeBodyState>,
    constraints: Vec<crate::constraint::CompiledConstraint>,
    arc_tracks: Vec<CompiledArcTrack>,
    attached_arc_track_by_body_id: HashMap<String, RuntimeArcTrackAttachment>,
    analyzer_blueprints: Vec<CompiledAnalyzer>,
    analyzers: Vec<TrajectoryAnalyzerState>,
    frame_number: u64,
    elapsed_time_seconds: f64,
    gravity: Vector2,
    fixed_delta_seconds: f64,
}

impl RuntimeScene {
    pub fn new(compiled: CompiledScene, fixed_delta_seconds: f64) -> Self {
        let CompiledScene {
            entities,
            constraints,
            arc_tracks,
            gravity,
            analyzers,
        } = compiled;
        let gravity = gravity.acceleration;
        let mut baseline = entities
            .into_iter()
            .map(|entity| RuntimeBodyState {
                entity_id: entity.id,
                shape: runtime_body_shape(&entity.shape),
                arc_track: runtime_arc_track_geometry(&entity.shape, entity.rotation_radians),
                position: entity.position,
                half_extents: shape_half_extents(&entity.shape),
                rotation_radians: entity.rotation_radians,
                velocity: entity.initial_velocity,
                angular_velocity_radians: 0.0,
                acceleration: if entity.is_static {
                    Vector2::ZERO
                } else {
                    gravity
                },
                mass: entity.mass,
                inverse_inertia: inverse_inertia_for_body(
                    runtime_body_shape(&entity.shape),
                    shape_half_extents(&entity.shape),
                    entity.mass,
                    entity.is_static,
                ),
                friction_coefficient: entity.friction_coefficient,
                restitution_coefficient: entity.restitution_coefficient,
                is_static: entity.is_static,
            })
            .collect::<Vec<_>>();
        let mut runtime_arc_tracks = arc_tracks;
        runtime_arc_tracks.extend(
            constraints
                .iter()
                .filter_map(compiled_arc_track_from_constraint),
        );
        project_track_bindings(
            &mut baseline,
            &constraints,
            &runtime_arc_tracks,
            &HashMap::new(),
        );
        let analyzer_blueprints = analyzers;
        let mut analyzers = analyzer_blueprints
            .iter()
            .map(TrajectoryAnalyzerState::from_compiled)
            .collect::<Vec<_>>();

        record_analyzers(&mut analyzers, 0, 0.0, &baseline);

        Self {
            baseline: baseline.clone(),
            bodies: baseline,
            constraints,
            arc_tracks: runtime_arc_tracks,
            attached_arc_track_by_body_id: HashMap::new(),
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
                .filter(|body| body.shape != RuntimeBodyShape::ArcTrack)
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
        let substep_count =
            contact_substeps::recommended_substep_count(&self.bodies, self.fixed_delta_seconds);
        let substep_delta_seconds = self.fixed_delta_seconds / substep_count as f64;

        for _ in 0..substep_count {
            step_bodies(
                &mut self.bodies,
                &self.constraints,
                &self.arc_tracks,
                &mut self.attached_arc_track_by_body_id,
                self.gravity,
                substep_delta_seconds,
            );
        }
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
        self.attached_arc_track_by_body_id.clear();
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

    pub fn all_analyzer_samples(&self) -> HashMap<String, Vec<TrajectorySample>> {
        self.analyzers
            .iter()
            .map(|analyzer| (analyzer.id().to_string(), analyzer.samples().to_vec()))
            .collect()
    }

    pub fn elapsed_time_seconds(&self) -> f64 {
        self.elapsed_time_seconds
    }

    pub fn frame_number(&self) -> u64 {
        self.frame_number
    }

    pub fn set_fixed_delta_seconds(&mut self, fixed_delta_seconds: f64) {
        self.fixed_delta_seconds = fixed_delta_seconds.max(f64::EPSILON);
    }
}

fn runtime_body_shape(shape: &CompiledShape) -> RuntimeBodyShape {
    match shape {
        CompiledShape::Ball { .. } => RuntimeBodyShape::Ball,
        CompiledShape::Block { .. } | CompiledShape::ConvexPolygon { .. } => RuntimeBodyShape::Box,
        CompiledShape::ArcTrack { .. } => RuntimeBodyShape::ArcTrack,
    }
}

fn runtime_arc_track_geometry(
    shape: &CompiledShape,
    rotation_radians: f64,
) -> Option<RuntimeArcTrackGeometry> {
    let CompiledShape::ArcTrack {
        radius,
        central_angle_degrees,
        thickness,
    } = shape
    else {
        return None;
    };

    let (start_angle_radians, end_angle_radians, span_radians) =
        validated_arc_start_and_span(rotation_radians, *central_angle_degrees)?;

    Some(RuntimeArcTrackGeometry {
        radius: *radius,
        half_thickness: *thickness * 0.5,
        start_angle_radians,
        end_angle_radians,
        span_radians,
    })
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
        CompiledShape::ArcTrack {
            radius, thickness, ..
        } => {
            let outer_radius = *radius + *thickness * 0.5;
            Vector2::new(outer_radius, outer_radius)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constraint::ConstraintDefinition;
    use crate::entity::{EntityDefinition, ShapeDefinition};
    use crate::force::ForceSourceDefinition;
    use crate::scene::{CompileSceneRequest, compile_scene};

    fn vector2(x: f64, y: f64) -> Vector2 {
        Vector2::new(x, y)
    }

    fn compile_runtime(
        entities: Vec<EntityDefinition>,
        constraints: Vec<ConstraintDefinition>,
        gravity: Vector2,
    ) -> RuntimeScene {
        let compiled = compile_scene(&CompileSceneRequest {
            entities,
            constraints,
            force_sources: vec![ForceSourceDefinition::Gravity {
                id: "gravity".to_string(),
                acceleration: gravity,
            }],
            analyzers: vec![],
        })
        .expect("scene should compile");

        RuntimeScene::new(compiled, 0.05)
    }

    fn dynamic_block(id: &str, position: Vector2, velocity: Vector2) -> EntityDefinition {
        EntityDefinition {
            id: id.to_string(),
            shape: ShapeDefinition::Block {
                width: 2.0,
                height: 1.0,
            },
            position,
            rotation_radians: 0.0,
            initial_velocity: velocity,
            mass: 1.0,
            is_static: false,
            friction_coefficient: 0.2,
            restitution_coefficient: 0.0,
        }
    }

    fn dynamic_ball(id: &str, position: Vector2, velocity: Vector2) -> EntityDefinition {
        EntityDefinition {
            id: id.to_string(),
            shape: ShapeDefinition::Ball { radius: 0.5 },
            position,
            rotation_radians: 0.0,
            initial_velocity: velocity,
            mass: 1.0,
            is_static: false,
            friction_coefficient: 0.0,
            restitution_coefficient: 0.0,
        }
    }

    fn static_arc_track(id: &str, center: Vector2) -> EntityDefinition {
        EntityDefinition {
            id: id.to_string(),
            shape: ShapeDefinition::ArcTrack {
                radius: 2.0,
                central_angle_degrees: 120.0,
                thickness: 0.18,
            },
            position: center,
            rotation_radians: 0.0,
            initial_velocity: Vector2::ZERO,
            mass: 0.0,
            is_static: true,
            friction_coefficient: 0.0,
            restitution_coefficient: 0.0,
        }
    }

    #[test]
    fn runtime_non_spring_bodies_keep_rigid_geometry_through_steps() {
        let mut runtime = compile_runtime(
            vec![
                dynamic_block("block", vector2(0.0, 3.0), vector2(1.0, 0.0)),
                dynamic_ball("ball", vector2(-2.0, 4.0), vector2(1.5, -0.5)),
                static_arc_track("arc", vector2(3.0, 3.0)),
            ],
            vec![],
            vector2(0.0, -9.81),
        );

        let baseline_geometry = runtime
            .baseline
            .iter()
            .map(|body| {
                (
                    body.entity_id.clone(),
                    (body.shape, body.half_extents, body.arc_track),
                )
            })
            .collect::<std::collections::HashMap<String, _>>();

        for _ in 0..12 {
            runtime.step();
        }

        for body in &runtime.bodies {
            let (baseline_shape, baseline_half_extents, baseline_arc_track) = baseline_geometry
                .get(&body.entity_id)
                .expect("baseline geometry should exist");
            assert_eq!(body.shape, *baseline_shape, "entity_id={}", body.entity_id);
            assert_eq!(
                body.half_extents, *baseline_half_extents,
                "entity_id={}",
                body.entity_id
            );
            assert_eq!(
                body.arc_track, *baseline_arc_track,
                "entity_id={}",
                body.entity_id
            );
        }
    }

    #[test]
    fn runtime_spring_stretch_changes_separation_without_deforming_bodies() {
        let mut runtime = compile_runtime(
            vec![
                dynamic_block("left", vector2(-2.0, 0.0), Vector2::ZERO),
                dynamic_block("right", vector2(2.0, 0.0), Vector2::ZERO),
            ],
            vec![ConstraintDefinition::Spring {
                id: "spring-1".to_string(),
                entity_a: "left".to_string(),
                entity_b: "right".to_string(),
                rest_length: 1.0,
                stiffness: 8.0,
            }],
            Vector2::ZERO,
        );

        let initial_distance = runtime.bodies[1]
            .position
            .sub(runtime.bodies[0].position)
            .length();
        let initial_geometries = runtime
            .bodies
            .iter()
            .map(|body| (body.entity_id.clone(), (body.shape, body.half_extents)))
            .collect::<std::collections::HashMap<String, _>>();

        for _ in 0..8 {
            runtime.step();
        }

        let final_distance = runtime.bodies[1]
            .position
            .sub(runtime.bodies[0].position)
            .length();
        assert!(
            final_distance < initial_distance,
            "expected spring to change body separation, initial={}, final={}",
            initial_distance,
            final_distance
        );

        for body in &runtime.bodies {
            let (initial_shape, initial_half_extents) = initial_geometries
                .get(&body.entity_id)
                .expect("initial geometry should exist");
            assert_eq!(body.shape, *initial_shape, "entity_id={}", body.entity_id);
            assert_eq!(
                body.half_extents, *initial_half_extents,
                "entity_id={}",
                body.entity_id
            );
        }
    }
}
