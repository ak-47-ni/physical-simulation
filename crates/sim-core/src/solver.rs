use std::collections::HashMap;

use crate::constraint::CompiledConstraint;
use crate::entity::Vector2;

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeBodyState {
    pub entity_id: String,
    pub position: Vector2,
    pub half_extents: Vector2,
    pub rotation_radians: f64,
    pub velocity: Vector2,
    pub acceleration: Vector2,
    pub mass: f64,
    pub friction_coefficient: f64,
    pub restitution_coefficient: f64,
    pub is_static: bool,
}

pub fn step_bodies(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    gravity: Vector2,
    delta_seconds: f64,
) {
    let static_surfaces = bodies
        .iter()
        .filter(|body| body.is_static)
        .cloned()
        .collect::<Vec<_>>();
    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.clone(), index))
        .collect::<HashMap<_, _>>();

    for body in bodies.iter_mut() {
        if body.is_static {
            body.acceleration = Vector2::ZERO;
            continue;
        }

        body.acceleration = gravity;
    }

    apply_constraints(bodies, constraints, &index_by_id);

    for body in bodies.iter_mut() {
        if body.is_static {
            continue;
        }

        body.velocity = Vector2::new(
            body.velocity.x + body.acceleration.x * delta_seconds,
            body.velocity.y + body.acceleration.y * delta_seconds,
        );
        body.position = Vector2::new(
            body.position.x + body.velocity.x * delta_seconds,
            body.position.y + body.velocity.y * delta_seconds,
        );

        for surface in &static_surfaces {
            resolve_static_contact(body, surface, delta_seconds);
        }
    }

    enforce_track_bindings(bodies, constraints, &index_by_id);
}

fn resolve_static_contact(
    body: &mut RuntimeBodyState,
    surface: &RuntimeBodyState,
    delta_seconds: f64,
) {
    let delta_x = body.position.x - surface.position.x;
    let delta_y = body.position.y - surface.position.y;
    let overlap_x = body.half_extents.x + surface.half_extents.x - delta_x.abs();
    let overlap_y = body.half_extents.y + surface.half_extents.y - delta_y.abs();

    if overlap_x <= 0.0 || overlap_y <= 0.0 {
        return;
    }

    let (normal_x, normal_y, penetration) = if overlap_y <= overlap_x {
        (0.0, if delta_y >= 0.0 { 1.0 } else { -1.0 }, overlap_y)
    } else {
        (if delta_x >= 0.0 { 1.0 } else { -1.0 }, 0.0, overlap_x)
    };

    body.position = Vector2::new(
        body.position.x + normal_x * penetration,
        body.position.y + normal_y * penetration,
    );

    let normal_velocity = body.velocity.x * normal_x + body.velocity.y * normal_y;

    if normal_velocity < 0.0 {
        let restitution = body
            .restitution_coefficient
            .max(surface.restitution_coefficient);
        let target_normal_velocity = -normal_velocity * restitution;
        let normal_delta = target_normal_velocity - normal_velocity;

        body.velocity = Vector2::new(
            body.velocity.x + normal_x * normal_delta,
            body.velocity.y + normal_y * normal_delta,
        );
    }

    let tangent_x = -normal_y;
    let tangent_y = normal_x;
    let tangential_velocity = body.velocity.x * tangent_x + body.velocity.y * tangent_y;
    let friction = (body.friction_coefficient + surface.friction_coefficient) * 0.5;
    let friction_delta = friction * 9.81 * delta_seconds;
    let target_tangential_velocity = reduce_magnitude(tangential_velocity, friction_delta);
    let tangential_delta = target_tangential_velocity - tangential_velocity;

    body.velocity = Vector2::new(
        body.velocity.x + tangent_x * tangential_delta,
        body.velocity.y + tangent_y * tangential_delta,
    );
}

fn reduce_magnitude(value: f64, amount: f64) -> f64 {
    if value > 0.0 {
        (value - amount).max(0.0)
    } else if value < 0.0 {
        (value + amount).min(0.0)
    } else {
        0.0
    }
}

fn apply_constraints(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    index_by_id: &HashMap<String, usize>,
) {
    for constraint in constraints {
        if let CompiledConstraint::Spring {
            entity_a,
            entity_b,
            rest_length,
            stiffness,
            ..
        } = constraint
        {
            let Some(&index_a) = index_by_id.get(entity_a) else {
                continue;
            };
            let Some(&index_b) = index_by_id.get(entity_b) else {
                continue;
            };
            let (body_a, body_b) = get_body_pair_mut(bodies, index_a, index_b);
            let displacement = body_b.position.sub(body_a.position);
            let distance = displacement.length();

            if distance <= f64::EPSILON {
                continue;
            }

            let direction = displacement.normalized();
            let force = direction.scale((distance - *rest_length) * *stiffness);

            if !body_a.is_static && body_a.mass > f64::EPSILON {
                body_a.acceleration = body_a.acceleration.add(force.scale(1.0 / body_a.mass));
            }

            if !body_b.is_static && body_b.mass > f64::EPSILON {
                body_b.acceleration = body_b.acceleration.add(force.scale(-1.0 / body_b.mass));
            }
        }
    }
}

fn enforce_track_bindings(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    index_by_id: &HashMap<String, usize>,
) {
    for constraint in constraints {
        if let CompiledConstraint::Track {
            entity_id,
            origin,
            axis,
            ..
        } = constraint
        {
            let Some(&index) = index_by_id.get(entity_id) else {
                continue;
            };
            let body = &mut bodies[index];
            let direction = axis.normalized();

            if direction.length() <= f64::EPSILON {
                continue;
            }

            let relative = body.position.sub(*origin);
            let projected_distance = relative.dot(direction);
            let projected_velocity = body.velocity.dot(direction);
            let projected_acceleration = body.acceleration.dot(direction);

            body.position = origin.add(direction.scale(projected_distance));
            body.velocity = direction.scale(projected_velocity);
            body.acceleration = direction.scale(projected_acceleration);
        }
    }
}

fn get_body_pair_mut(
    bodies: &mut [RuntimeBodyState],
    index_a: usize,
    index_b: usize,
) -> (&mut RuntimeBodyState, &mut RuntimeBodyState) {
    assert_ne!(index_a, index_b);

    if index_a < index_b {
        let (left, right) = bodies.split_at_mut(index_b);
        (&mut left[index_a], &mut right[0])
    } else {
        let (left, right) = bodies.split_at_mut(index_a);
        (&mut right[0], &mut left[index_b])
    }
}
