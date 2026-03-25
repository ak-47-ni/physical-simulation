use crate::solver::RuntimeBodyState;

pub fn recommended_substep_count(bodies: &[RuntimeBodyState], delta_seconds: f64) -> usize {
    super::contact_budget::recommended_substep_count_for_bodies(bodies, delta_seconds)
}
