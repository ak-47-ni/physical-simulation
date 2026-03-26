use crate::solver::RuntimeBodyState;

pub fn recommended_substep_count(bodies: &[RuntimeBodyState], delta_seconds: f64) -> usize {
    super::contact_budget::recommended_substep_count_for_bodies(bodies, delta_seconds).max(
        angular_motion_substep_count(bodies, delta_seconds),
    )
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
