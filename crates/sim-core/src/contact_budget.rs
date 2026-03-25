use crate::solver::RuntimeBodyState;

const MIN_EXTENT_EPSILON: f64 = 1e-3;
const TARGET_TRAVEL_EXTENT_FRACTION: f64 = 0.25;
const MAX_CONTACT_SUBSTEPS: usize = 64;

pub(super) fn recommended_substep_count_for_bodies(
    bodies: &[RuntimeBodyState],
    delta_seconds: f64,
) -> usize {
    if delta_seconds <= f64::EPSILON {
        return 1;
    }

    let mut required_substeps = 1usize;

    for index_a in 0..bodies.len() {
        for index_b in (index_a + 1)..bodies.len() {
            let body_a = &bodies[index_a];
            let body_b = &bodies[index_b];

            if body_a.is_static && body_b.is_static {
                continue;
            }

            let relative_travel =
                predicted_travel(body_a, delta_seconds) + predicted_travel(body_b, delta_seconds);
            let min_pair_extent = minimum_body_extent(body_a)
                .min(minimum_body_extent(body_b))
                .max(MIN_EXTENT_EPSILON);

            if relative_travel <= f64::EPSILON || !relative_travel.is_finite() {
                continue;
            }

            let target_travel = min_pair_extent * TARGET_TRAVEL_EXTENT_FRACTION;
            let pair_substeps = (relative_travel / target_travel).ceil() as usize;
            required_substeps = required_substeps.max(pair_substeps);
        }
    }

    required_substeps.clamp(1, MAX_CONTACT_SUBSTEPS)
}

fn predicted_travel(body: &RuntimeBodyState, delta_seconds: f64) -> f64 {
    if body.is_static {
        return 0.0;
    }

    let speed = body.velocity.length();
    let acceleration = body.acceleration.length();
    let travel = speed * delta_seconds + 0.5 * acceleration * delta_seconds * delta_seconds;

    if travel.is_finite() {
        travel.max(0.0)
    } else {
        0.0
    }
}

fn minimum_body_extent(body: &RuntimeBodyState) -> f64 {
    let extent = body.half_extents.x.min(body.half_extents.y) * 2.0;

    if extent.is_finite() && extent > f64::EPSILON {
        extent
    } else {
        MIN_EXTENT_EPSILON
    }
}
