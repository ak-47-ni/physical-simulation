use std::collections::HashMap;

use crate::constraint::CompiledConstraint;
use crate::solver::{RuntimeBodyState, inverse_mass};

const SPRING_TARGET_PHASE_STEP_RADIANS: f64 = 0.05;

pub fn recommended_substep_count(
    bodies: &[RuntimeBodyState],
    constraints: &[CompiledConstraint],
    delta_seconds: f64,
) -> usize {
    super::contact_budget::recommended_substep_count_for_bodies(bodies, delta_seconds)
        .max(angular_motion_substep_count(bodies, delta_seconds))
        .max(spring_motion_substep_count(
            bodies,
            constraints,
            delta_seconds,
        ))
}

fn angular_motion_substep_count(bodies: &[RuntimeBodyState], delta_seconds: f64) -> usize {
    if delta_seconds <= f64::EPSILON {
        return 1;
    }

    let mut required_substeps = 1usize;

    for body in bodies {
        if body.is_static || body.angular_velocity_radians.abs() <= f64::EPSILON {
            continue;
        }

        let max_radius = body.half_extents.length().max(1e-3);
        let angular_edge_travel = body.angular_velocity_radians.abs() * max_radius * delta_seconds;
        let target_travel = body.half_extents.x.min(body.half_extents.y).max(1e-3) * 0.25;
        let body_substeps = (angular_edge_travel / target_travel).ceil() as usize;
        required_substeps = required_substeps.max(body_substeps.max(1));
    }

    required_substeps.clamp(1, 64)
}

fn spring_motion_substep_count(
    bodies: &[RuntimeBodyState],
    constraints: &[CompiledConstraint],
    delta_seconds: f64,
) -> usize {
    if delta_seconds <= f64::EPSILON {
        return 1;
    }

    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.as_str(), index))
        .collect::<HashMap<_, _>>();
    let mut required_substeps = 1usize;

    for constraint in constraints {
        let CompiledConstraint::Spring {
            entity_a,
            entity_b,
            stiffness,
            ..
        } = constraint
        else {
            continue;
        };

        let Some(&index_a) = index_by_id.get(entity_a.as_str()) else {
            continue;
        };
        let Some(&index_b) = index_by_id.get(entity_b.as_str()) else {
            continue;
        };
        let body_a = &bodies[index_a];
        let body_b = &bodies[index_b];

        if body_a.is_static && body_b.is_static {
            continue;
        }

        let inverse_mass = inverse_mass(body_a) + inverse_mass(body_b);

        if inverse_mass <= f64::EPSILON || *stiffness <= f64::EPSILON {
            continue;
        }

        let omega = (stiffness * inverse_mass).sqrt();
        let phase_step = omega * delta_seconds;

        if !phase_step.is_finite() || phase_step <= SPRING_TARGET_PHASE_STEP_RADIANS {
            continue;
        }

        let spring_substeps = (phase_step / SPRING_TARGET_PHASE_STEP_RADIANS).ceil() as usize;
        required_substeps = required_substeps.max(spring_substeps.max(1));
    }

    required_substeps.clamp(1, 64)
}
