#[path = "angular_dynamics.rs"]
mod angular_dynamics;

#[path = "contact_geometry.rs"]
mod contact_geometry;

use std::collections::HashMap;

use crate::constraint::CompiledConstraint;
use crate::entity::Vector2;

pub use angular_dynamics::inverse_inertia_for_body;

const DYNAMIC_CONTACT_PASSES: usize = 16;
const POSITION_CORRECTION_SLOP: f64 = 1e-6;
const SUPPORT_CONTACT_LINEAR_SPEED_THRESHOLD: f64 = 1.5;
const SUPPORT_CONTACT_PENETRATION_THRESHOLD: f64 = 0.15;
const SUPPORT_CONTACT_ANGULAR_DAMPING: f64 = 0.4;
const SUPPORT_CONTACT_ANGULAR_REST_THRESHOLD: f64 = 1e-3;
const IMPLICIT_BOUNDARY_NORMALS: [Vector2; 2] = [Vector2::new(1.0, 0.0), Vector2::new(0.0, 1.0)];
const IMPLICIT_BOUNDARY_FRICTION_COEFFICIENT: f64 = 0.0;
const IMPLICIT_BOUNDARY_RESTITUTION_COEFFICIENT: f64 = 0.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeBodyShape {
    Ball,
    Box,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeBodyState {
    pub entity_id: String,
    pub shape: RuntimeBodyShape,
    pub position: Vector2,
    pub half_extents: Vector2,
    pub rotation_radians: f64,
    pub velocity: Vector2,
    pub angular_velocity_radians: f64,
    pub acceleration: Vector2,
    pub mass: f64,
    pub inverse_inertia: f64,
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
            body.angular_velocity_radians = 0.0;
            continue;
        }

        body.acceleration = gravity;
    }

    apply_constraints(bodies, constraints, &index_by_id);

    for body in bodies.iter_mut() {
        if body.is_static {
            continue;
        }

        body.velocity = body.velocity.add(body.acceleration.scale(delta_seconds));
        body.position = body.position.add(body.velocity.scale(delta_seconds));
        angular_dynamics::integrate_rotation(body, delta_seconds);
    }

    resolve_static_contacts(bodies, &static_surfaces);
    resolve_dynamic_contacts(bodies, &static_surfaces);
    enforce_track_bindings(bodies, constraints, &index_by_id);
}

pub fn project_track_bindings(bodies: &mut [RuntimeBodyState], constraints: &[CompiledConstraint]) {
    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.clone(), index))
        .collect::<HashMap<_, _>>();

    enforce_track_bindings(bodies, constraints, &index_by_id);
}

pub fn inverse_mass(body: &RuntimeBodyState) -> f64 {
    if body.is_static || body.mass <= f64::EPSILON {
        0.0
    } else {
        1.0 / body.mass
    }
}

fn resolve_static_contacts(bodies: &mut [RuntimeBodyState], static_surfaces: &[RuntimeBodyState]) {
    for body in bodies.iter_mut() {
        if body.is_static {
            continue;
        }

        resolve_implicit_boundaries(body);

        for surface in static_surfaces {
            resolve_contact_with_surface(body, surface);
        }

        resolve_implicit_boundaries(body);
    }
}

fn resolve_dynamic_contacts(bodies: &mut [RuntimeBodyState], static_surfaces: &[RuntimeBodyState]) {
    for _ in 0..DYNAMIC_CONTACT_PASSES {
        for index_a in 0..bodies.len() {
            for index_b in (index_a + 1)..bodies.len() {
                let (body_a, body_b) = get_body_pair_mut(bodies, index_a, index_b);

                if body_a.is_static || body_b.is_static {
                    continue;
                }

                resolve_contact_pair(body_a, body_b);
            }
        }

        resolve_static_contacts(bodies, static_surfaces);
    }
}

fn resolve_contact_with_surface(body: &mut RuntimeBodyState, surface: &RuntimeBodyState) {
    let Some(contact) = contact_geometry::contact_manifold(body, surface) else {
        return;
    };

    resolve_surface_contact_manifold(
        body,
        contact,
        surface.friction_coefficient,
        surface.restitution_coefficient,
        surface.is_static,
    );
}

fn resolve_implicit_boundaries(body: &mut RuntimeBodyState) {
    for normal in IMPLICIT_BOUNDARY_NORMALS {
        let Some(contact) = contact_geometry::boundary_contact_manifold(body, normal) else {
            continue;
        };

        resolve_surface_contact_manifold(
            body,
            contact,
            IMPLICIT_BOUNDARY_FRICTION_COEFFICIENT,
            IMPLICIT_BOUNDARY_RESTITUTION_COEFFICIENT,
            true,
        );
    }
}

fn resolve_surface_contact_manifold(
    body: &mut RuntimeBodyState,
    contact: contact_geometry::ContactManifold,
    surface_friction_coefficient: f64,
    surface_restitution_coefficient: f64,
    locked_surface: bool,
) {
    let inverse_mass_body = inverse_mass(body);

    if inverse_mass_body <= f64::EPSILON {
        return;
    }

    let correction = positional_correction(contact.penetration);
    body.position = body.position.add(contact.normal.scale(correction));

    let support_contact =
        is_support_contact(body, contact.normal, contact.penetration, locked_surface);
    let point = if support_contact {
        body.position
    } else {
        contact.point
    };
    let normal = contact.normal;
    let radial_offset = point.sub(body.position);
    let relative_velocity = angular_dynamics::velocity_at_point(body, point);
    let normal_velocity = relative_velocity.dot(normal);
    let inverse_normal_mass =
        inverse_mass_body + radial_offset.cross(normal).powi(2) * body.inverse_inertia;

    let mut normal_impulse = 0.0;

    if normal_velocity < 0.0 && inverse_normal_mass > f64::EPSILON {
        let restitution = if support_contact {
            0.0
        } else {
            body.restitution_coefficient
                .max(surface_restitution_coefficient)
        };
        normal_impulse = -((1.0 + restitution) * normal_velocity) / inverse_normal_mass;
        angular_dynamics::apply_impulse(body, normal.scale(normal_impulse), point);
    }

    apply_friction_impulse_against_surface(
        body,
        surface_friction_coefficient,
        point,
        normal,
        normal_impulse,
    );

    if support_contact {
        damp_support_rotation(body);
    }
}

fn resolve_contact_pair(body_a: &mut RuntimeBodyState, body_b: &mut RuntimeBodyState) {
    let Some(contact) = contact_geometry::contact_manifold(body_a, body_b) else {
        return;
    };

    let inverse_mass_a = inverse_mass(body_a);
    let inverse_mass_b = inverse_mass(body_b);
    let total_inverse_mass = inverse_mass_a + inverse_mass_b;

    if total_inverse_mass <= f64::EPSILON {
        return;
    }

    let correction = positional_correction(contact.penetration);
    let correction_a = correction * (inverse_mass_a / total_inverse_mass);
    let correction_b = correction * (inverse_mass_b / total_inverse_mass);

    body_a.position = body_a.position.add(contact.normal.scale(correction_a));
    body_b.position = body_b.position.sub(contact.normal.scale(correction_b));

    let point = contact.point;
    let normal = contact.normal;
    let radial_offset_a = point.sub(body_a.position);
    let radial_offset_b = point.sub(body_b.position);
    let relative_velocity = angular_dynamics::velocity_at_point(body_a, point)
        .sub(angular_dynamics::velocity_at_point(body_b, point));
    let normal_velocity = relative_velocity.dot(normal);
    let inverse_normal_mass = total_inverse_mass
        + radial_offset_a.cross(normal).powi(2) * body_a.inverse_inertia
        + radial_offset_b.cross(normal).powi(2) * body_b.inverse_inertia;

    let mut normal_impulse = 0.0;

    if normal_velocity < 0.0 && inverse_normal_mass > f64::EPSILON {
        let restitution = body_a
            .restitution_coefficient
            .max(body_b.restitution_coefficient);
        normal_impulse = -((1.0 + restitution) * normal_velocity) / inverse_normal_mass;
        let impulse = normal.scale(normal_impulse);
        angular_dynamics::apply_impulse(body_a, impulse, point);
        angular_dynamics::apply_impulse(body_b, impulse.scale(-1.0), point);
    }

    apply_friction_impulse_between_bodies(body_a, body_b, point, normal, normal_impulse);
}

fn apply_friction_impulse_against_surface(
    body: &mut RuntimeBodyState,
    surface_friction_coefficient: f64,
    point: Vector2,
    normal: Vector2,
    normal_impulse: f64,
) {
    let relative_velocity = angular_dynamics::velocity_at_point(body, point);
    let tangent = tangent_direction(relative_velocity, normal);
    let tangential_speed = relative_velocity.dot(tangent);

    if tangential_speed.abs() <= f64::EPSILON {
        return;
    }

    let radial_offset = point.sub(body.position);
    let inverse_tangent_mass =
        inverse_mass(body) + radial_offset.cross(tangent).powi(2) * body.inverse_inertia;

    if inverse_tangent_mass <= f64::EPSILON {
        return;
    }

    let friction = (body.friction_coefficient + surface_friction_coefficient) * 0.5;
    let max_friction_impulse = friction * normal_impulse.abs();
    let tangential_impulse = (-tangential_speed / inverse_tangent_mass)
        .clamp(-max_friction_impulse, max_friction_impulse);

    angular_dynamics::apply_impulse(body, tangent.scale(tangential_impulse), point);
}

fn apply_friction_impulse_between_bodies(
    body_a: &mut RuntimeBodyState,
    body_b: &mut RuntimeBodyState,
    point: Vector2,
    normal: Vector2,
    normal_impulse: f64,
) {
    let relative_velocity = angular_dynamics::velocity_at_point(body_a, point)
        .sub(angular_dynamics::velocity_at_point(body_b, point));
    let tangent = tangent_direction(relative_velocity, normal);
    let tangential_speed = relative_velocity.dot(tangent);

    if tangential_speed.abs() <= f64::EPSILON {
        return;
    }

    let radial_offset_a = point.sub(body_a.position);
    let radial_offset_b = point.sub(body_b.position);
    let inverse_tangent_mass = inverse_mass(body_a)
        + inverse_mass(body_b)
        + radial_offset_a.cross(tangent).powi(2) * body_a.inverse_inertia
        + radial_offset_b.cross(tangent).powi(2) * body_b.inverse_inertia;

    if inverse_tangent_mass <= f64::EPSILON {
        return;
    }

    let friction = (body_a.friction_coefficient + body_b.friction_coefficient) * 0.5;
    let max_friction_impulse = friction * normal_impulse.abs();
    let tangential_impulse = (-tangential_speed / inverse_tangent_mass)
        .clamp(-max_friction_impulse, max_friction_impulse);
    let impulse = tangent.scale(tangential_impulse);

    angular_dynamics::apply_impulse(body_a, impulse, point);
    angular_dynamics::apply_impulse(body_b, impulse.scale(-1.0), point);
}

fn positional_correction(penetration: f64) -> f64 {
    (penetration - POSITION_CORRECTION_SLOP).max(0.0)
}

fn is_support_contact(
    body: &RuntimeBodyState,
    normal: Vector2,
    penetration: f64,
    locked_surface: bool,
) -> bool {
    if !locked_surface || body.shape != RuntimeBodyShape::Box {
        return false;
    }

    let penetration_limit = (contact_geometry::projected_extent(body, normal) * 0.5)
        .min(SUPPORT_CONTACT_PENETRATION_THRESHOLD);

    if penetration > penetration_limit {
        return false;
    }

    body.velocity.dot(normal) >= -SUPPORT_CONTACT_LINEAR_SPEED_THRESHOLD
}

fn damp_support_rotation(body: &mut RuntimeBodyState) {
    body.angular_velocity_radians *= SUPPORT_CONTACT_ANGULAR_DAMPING;

    if body.angular_velocity_radians.abs() <= SUPPORT_CONTACT_ANGULAR_REST_THRESHOLD {
        body.angular_velocity_radians = 0.0;
    }
}

fn tangent_direction(relative_velocity: Vector2, normal: Vector2) -> Vector2 {
    let tangent = relative_velocity.sub(normal.scale(relative_velocity.dot(normal)));

    if tangent.length() > f64::EPSILON {
        tangent.normalized()
    } else {
        normal.perp()
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
