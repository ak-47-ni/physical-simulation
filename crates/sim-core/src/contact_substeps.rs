use crate::solver::RuntimeBodyState;

const MIN_EXTENT_EPSILON: f64 = 1e-3;
const TARGET_TRAVEL_EXTENT_FRACTION: f64 = 0.5;
const MAX_CONTACT_SUBSTEPS: usize = 12;

pub fn recommended_substep_count(bodies: &[RuntimeBodyState], delta_seconds: f64) -> usize {
    if delta_seconds <= f64::EPSILON {
        return 1;
    }

    let max_dynamic_speed = bodies
        .iter()
        .filter(|body| !body.is_static)
        .map(|body| body.velocity.length())
        .fold(0.0_f64, f64::max);
    let min_body_extent = bodies
        .iter()
        .map(|body| body.half_extents.x.min(body.half_extents.y) * 2.0)
        .filter(|extent| extent.is_finite() && *extent > f64::EPSILON)
        .fold(f64::INFINITY, f64::min);

    if max_dynamic_speed <= f64::EPSILON || !min_body_extent.is_finite() {
        return 1;
    }

    let max_travel = max_dynamic_speed * delta_seconds;
    let target_travel = (min_body_extent * TARGET_TRAVEL_EXTENT_FRACTION).max(MIN_EXTENT_EPSILON);
    let required_substeps = (max_travel / target_travel).ceil() as usize;

    required_substeps.clamp(1, MAX_CONTACT_SUBSTEPS)
}
