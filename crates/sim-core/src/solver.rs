#[path = "angular_dynamics.rs"]
mod angular_dynamics;

#[path = "contact_geometry.rs"]
mod contact_geometry;

use std::collections::{HashMap, HashSet};

use crate::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackCapturePolicy, ArcTrackEndpointGeometry, CompiledArcTrack,
};
use crate::constraint::{ArcTrackSide, CompiledConstraint};
use crate::entity::Vector2;

pub use angular_dynamics::inverse_inertia_for_body;

const DYNAMIC_CONTACT_PASSES: usize = 16;
const POSITION_CORRECTION_SLOP: f64 = 1e-6;
const SUPPORT_CONTACT_LINEAR_SPEED_THRESHOLD: f64 = 1.5;
const SUPPORT_CONTACT_PENETRATION_THRESHOLD: f64 = 0.15;
const SUPPORT_CONTACT_ANGULAR_DAMPING: f64 = 0.4;
const SUPPORT_CONTACT_ANGULAR_REST_THRESHOLD: f64 = 1e-3;
const ARC_ENTRY_CAPTURE_DISTANCE_THRESHOLD: f64 = 0.75;
const ARC_ENTRY_CAPTURE_ALIGNMENT_THRESHOLD: f64 = 0.8;
const ARC_ENTRY_CAPTURE_APPROACH_TOLERANCE: f64 = 0.2;
const ARC_ENTRY_CAPTURE_SIDE_TOLERANCE: f64 = 0.2;
const ARC_ENTRY_ANCHORED_JUNCTION_POSITION_TOLERANCE: f64 = 0.05;
const ARC_ENTRY_ANCHORED_JUNCTION_SURFACE_TOLERANCE: f64 = 0.15;
const ARC_ENTRY_ANCHORED_JUNCTION_CROSSING_TOLERANCE: f64 = 1e-6;
const ARC_ENTRY_ANCHORED_JUNCTION_OVERSHOOT_PADDING: f64 = 0.05;
const ARC_ENTRY_ANCHORED_SUPPORT_ACCELERATION_TOLERANCE: f64 = 1e-6;
const IMPLICIT_BOUNDARY_NORMALS: [Vector2; 2] = [Vector2::new(1.0, 0.0), Vector2::new(0.0, 1.0)];
const IMPLICIT_BOUNDARY_FRICTION_COEFFICIENT: f64 = 0.0;
const IMPLICIT_BOUNDARY_RESTITUTION_COEFFICIENT: f64 = 0.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeBodyShape {
    Ball,
    Box,
    ArcTrack,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RuntimeArcTrackGeometry {
    pub radius: f64,
    pub half_thickness: f64,
    pub start_angle_radians: f64,
    pub end_angle_radians: f64,
    pub span_radians: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeBodyState {
    pub entity_id: String,
    pub shape: RuntimeBodyShape,
    pub arc_track: Option<RuntimeArcTrackGeometry>,
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

#[derive(Debug, Clone, Copy, PartialEq)]
struct RuntimeAnchorEndpointGeometry {
    position: Vector2,
    tangent: Vector2,
    surface_normal: Vector2,
}

pub fn step_bodies(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    arc_tracks: &[CompiledArcTrack],
    attached_arc_track_by_body_id: &mut HashMap<String, String>,
    gravity: Vector2,
    delta_seconds: f64,
) {
    let previous_positions = bodies.iter().map(|body| body.position).collect::<Vec<_>>();
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

        body.position = body
            .position
            .add(body.velocity.scale(delta_seconds))
            .add(body.acceleration.scale(0.5 * delta_seconds * delta_seconds));
        body.velocity = body.velocity.add(body.acceleration.scale(delta_seconds));
        angular_dynamics::integrate_rotation(body, delta_seconds);
    }

    resolve_static_contacts(bodies, &static_surfaces, delta_seconds);
    resolve_dynamic_contacts(bodies, &static_surfaces, delta_seconds);
    let freshly_captured_body_ids = capture_arc_entries(
        bodies,
        arc_tracks,
        &index_by_id,
        &previous_positions,
        attached_arc_track_by_body_id,
    );
    enforce_track_bindings(
        bodies,
        constraints,
        arc_tracks,
        &index_by_id,
        attached_arc_track_by_body_id,
        &freshly_captured_body_ids,
    );
}

pub fn project_track_bindings(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    arc_tracks: &[CompiledArcTrack],
    attached_arc_track_by_body_id: &HashMap<String, String>,
) {
    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.clone(), index))
        .collect::<HashMap<_, _>>();

    enforce_track_bindings(
        bodies,
        constraints,
        arc_tracks,
        &index_by_id,
        &mut attached_arc_track_by_body_id.clone(),
        &HashSet::new(),
    );
}

pub fn inverse_mass(body: &RuntimeBodyState) -> f64 {
    if body.is_static || body.mass <= f64::EPSILON {
        0.0
    } else {
        1.0 / body.mass
    }
}

fn resolve_static_contacts(
    bodies: &mut [RuntimeBodyState],
    static_surfaces: &[RuntimeBodyState],
    delta_seconds: f64,
) {
    for body in bodies.iter_mut() {
        if body.is_static {
            continue;
        }

        resolve_implicit_boundaries(body, delta_seconds);

        for surface in static_surfaces {
            resolve_contact_with_surface(body, surface, delta_seconds);
        }

        resolve_implicit_boundaries(body, delta_seconds);
    }
}

fn resolve_dynamic_contacts(
    bodies: &mut [RuntimeBodyState],
    static_surfaces: &[RuntimeBodyState],
    delta_seconds: f64,
) {
    for _ in 0..DYNAMIC_CONTACT_PASSES {
        for index_a in 0..bodies.len() {
            for index_b in (index_a + 1)..bodies.len() {
                let (body_a, body_b) = get_body_pair_mut(bodies, index_a, index_b);

                if body_a.is_static || body_b.is_static {
                    continue;
                }

                resolve_contact_pair(body_a, body_b, delta_seconds);
            }
        }

        resolve_static_contacts(bodies, static_surfaces, delta_seconds);
    }
}

fn resolve_contact_with_surface(
    body: &mut RuntimeBodyState,
    surface: &RuntimeBodyState,
    delta_seconds: f64,
) {
    let Some(contact) = contact_geometry::contact_manifold(body, surface) else {
        return;
    };

    resolve_surface_contact_manifold(
        body,
        contact,
        surface.friction_coefficient,
        surface.restitution_coefficient,
        surface.is_static,
        delta_seconds,
    );
}

fn resolve_implicit_boundaries(body: &mut RuntimeBodyState, delta_seconds: f64) {
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
            delta_seconds,
        );
    }
}

fn resolve_surface_contact_manifold(
    body: &mut RuntimeBodyState,
    contact: contact_geometry::ContactManifold,
    surface_friction_coefficient: f64,
    surface_restitution_coefficient: f64,
    locked_surface: bool,
    delta_seconds: f64,
) {
    let inverse_mass_body = inverse_mass(body);

    if inverse_mass_body <= f64::EPSILON {
        return;
    }

    let support_contact =
        is_support_contact(body, contact.normal, contact.penetration, locked_surface);
    let point = if support_contact {
        body.position
    } else {
        contact.point
    };
    let normal = contact.normal;
    let relative_velocity = angular_dynamics::velocity_at_point(body, point);
    let normal_velocity = relative_velocity.dot(normal);
    let restitution = if support_contact {
        0.0
    } else {
        body.restitution_coefficient
            .max(surface_restitution_coefficient)
    };
    let rollback_seconds = if support_contact || restitution <= f64::EPSILON {
        0.0
    } else {
        estimated_contact_rollback_seconds(contact.penetration, normal_velocity, delta_seconds)
    };
    let effective_penetration = if rollback_seconds > f64::EPSILON {
        rewind_body_for_contact(body, rollback_seconds);
        residual_penetration_after_rollback(contact.penetration, normal_velocity, rollback_seconds)
    } else {
        contact.penetration
    };
    let correction = positional_correction(effective_penetration);
    body.position = body.position.add(contact.normal.scale(correction));
    let point = if support_contact {
        body.position
    } else {
        contact.point
    };
    let radial_offset = point.sub(body.position);
    let relative_velocity = angular_dynamics::velocity_at_point(body, point);
    let normal_velocity = relative_velocity.dot(normal);
    let inverse_normal_mass =
        inverse_mass_body + radial_offset.cross(normal).powi(2) * body.inverse_inertia;

    let mut normal_impulse = 0.0;

    if normal_velocity < 0.0 && inverse_normal_mass > f64::EPSILON {
        normal_impulse = -((1.0 + restitution) * normal_velocity) / inverse_normal_mass;
        angular_dynamics::apply_impulse(body, normal.scale(normal_impulse), point);
    }

    if support_contact || restitution <= f64::EPSILON {
        apply_friction_impulse_against_surface(
            body,
            surface_friction_coefficient,
            point,
            normal,
            normal_impulse,
        );
    }

    if support_contact {
        damp_support_rotation(body);
    }

    if rollback_seconds > f64::EPSILON {
        advance_body_after_contact(body, rollback_seconds);
    }
}

fn resolve_contact_pair(
    body_a: &mut RuntimeBodyState,
    body_b: &mut RuntimeBodyState,
    delta_seconds: f64,
) {
    let Some(contact) = contact_geometry::contact_manifold(body_a, body_b) else {
        return;
    };

    let inverse_mass_a = inverse_mass(body_a);
    let inverse_mass_b = inverse_mass(body_b);
    let total_inverse_mass = inverse_mass_a + inverse_mass_b;

    if total_inverse_mass <= f64::EPSILON {
        return;
    }

    let point = contact.point;
    let normal = contact.normal;
    let relative_velocity = angular_dynamics::velocity_at_point(body_a, point)
        .sub(angular_dynamics::velocity_at_point(body_b, point));
    let normal_velocity = relative_velocity.dot(normal);
    let restitution = body_a
        .restitution_coefficient
        .max(body_b.restitution_coefficient);
    let rollback_seconds = if restitution <= f64::EPSILON {
        0.0
    } else {
        estimated_contact_rollback_seconds(contact.penetration, normal_velocity, delta_seconds)
    };
    let effective_penetration = if rollback_seconds > f64::EPSILON {
        rewind_body_for_contact(body_a, rollback_seconds);
        rewind_body_for_contact(body_b, rollback_seconds);
        residual_penetration_after_rollback(contact.penetration, normal_velocity, rollback_seconds)
    } else {
        contact.penetration
    };
    let correction = positional_correction(effective_penetration);
    let correction_a = correction * (inverse_mass_a / total_inverse_mass);
    let correction_b = correction * (inverse_mass_b / total_inverse_mass);

    body_a.position = body_a.position.add(contact.normal.scale(correction_a));
    body_b.position = body_b.position.sub(contact.normal.scale(correction_b));

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
        normal_impulse = -((1.0 + restitution) * normal_velocity) / inverse_normal_mass;
        let impulse = normal.scale(normal_impulse);
        angular_dynamics::apply_impulse(body_a, impulse, point);
        angular_dynamics::apply_impulse(body_b, impulse.scale(-1.0), point);
    }

    if restitution <= f64::EPSILON {
        apply_friction_impulse_between_bodies(body_a, body_b, point, normal, normal_impulse);
    }

    if rollback_seconds > f64::EPSILON {
        advance_body_after_contact(body_a, rollback_seconds);
        advance_body_after_contact(body_b, rollback_seconds);
    }
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

fn estimated_contact_rollback_seconds(
    penetration: f64,
    normal_velocity: f64,
    delta_seconds: f64,
) -> f64 {
    if penetration <= f64::EPSILON
        || normal_velocity >= -f64::EPSILON
        || delta_seconds <= f64::EPSILON
    {
        return 0.0;
    }

    (penetration / -normal_velocity).clamp(0.0, delta_seconds)
}

fn residual_penetration_after_rollback(
    penetration: f64,
    normal_velocity: f64,
    rollback_seconds: f64,
) -> f64 {
    if rollback_seconds <= f64::EPSILON {
        return penetration;
    }

    (penetration - (-normal_velocity * rollback_seconds)).max(0.0)
}

// Rewind elastic contacts to the estimated time of impact, apply the impulse there,
// then integrate the remainder of the substep with the post-collision velocity.
fn rewind_body_for_contact(body: &mut RuntimeBodyState, rollback_seconds: f64) {
    if body.is_static || rollback_seconds <= f64::EPSILON {
        return;
    }

    body.position = body
        .position
        .sub(body.velocity.scale(rollback_seconds))
        .add(
            body.acceleration
                .scale(0.5 * rollback_seconds * rollback_seconds),
        );
    body.velocity = body.velocity.sub(body.acceleration.scale(rollback_seconds));
    body.rotation_radians -= body.angular_velocity_radians * rollback_seconds;
}

fn advance_body_after_contact(body: &mut RuntimeBodyState, advance_seconds: f64) {
    if body.is_static || advance_seconds <= f64::EPSILON {
        return;
    }

    body.position = body.position.add(body.velocity.scale(advance_seconds)).add(
        body.acceleration
            .scale(0.5 * advance_seconds * advance_seconds),
    );
    body.velocity = body.velocity.add(body.acceleration.scale(advance_seconds));
    body.rotation_radians += body.angular_velocity_radians * advance_seconds;
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
    arc_tracks: &[CompiledArcTrack],
    index_by_id: &HashMap<String, usize>,
    attached_arc_track_by_body_id: &mut HashMap<String, String>,
    freshly_captured_body_ids: &HashSet<String>,
) {
    for constraint in constraints {
        match constraint {
            CompiledConstraint::Track {
                entity_id,
                origin,
                axis,
                ..
            } => {
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
            CompiledConstraint::ArcTrack { .. } => {}
            CompiledConstraint::Spring { .. } => {}
        }
    }

    for arc_track in arc_tracks {
        let attached_body_ids = attached_arc_track_by_body_id
            .iter()
            .filter_map(|(body_id, constraint_id)| {
                if constraint_id == &arc_track.id {
                    Some(body_id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        for body_id in attached_body_ids {
            let Some(&index) = index_by_id.get(&body_id) else {
                attached_arc_track_by_body_id.remove(&body_id);
                continue;
            };
            let body = &mut bodies[index];
            let keep_attached = enforce_arc_track_attachment(
                body,
                arc_track.center,
                arc_track.radius,
                arc_track.start_angle_radians,
                arc_track.end_angle_radians,
                arc_track.span_radians,
                arc_track.side,
                !freshly_captured_body_ids.contains(&body_id),
            );

            if !keep_attached {
                attached_arc_track_by_body_id.remove(&body_id);
            }
        }
    }
}

fn capture_arc_entries(
    bodies: &mut [RuntimeBodyState],
    arc_tracks: &[CompiledArcTrack],
    index_by_id: &HashMap<String, usize>,
    previous_positions: &[Vector2],
    attached_arc_track_by_body_id: &mut HashMap<String, String>,
) -> HashSet<String> {
    let mut freshly_captured_body_ids = HashSet::new();
    let mut occupied_arc_track_ids = attached_arc_track_by_body_id
        .values()
        .cloned()
        .collect::<HashSet<_>>();

    for arc_track in arc_tracks {
        if occupied_arc_track_ids.contains(&arc_track.id) {
            continue;
        }

        let capture_endpoints = match arc_track.capture_policy {
            ArcTrackCapturePolicy::Start => {
                [Some(crate::constraint::ArcTrackEntryEndpoint::Start), None]
            }
            ArcTrackCapturePolicy::End => {
                [Some(crate::constraint::ArcTrackEntryEndpoint::End), None]
            }
            ArcTrackCapturePolicy::Either => [
                Some(crate::constraint::ArcTrackEntryEndpoint::Start),
                Some(crate::constraint::ArcTrackEntryEndpoint::End),
            ],
        };

        'body_search: for entry_endpoint in capture_endpoints.into_iter().flatten() {
            let endpoint_geometry = crate::arc_track::endpoint_geometry(
                arc_track.center,
                arc_track.radius,
                arc_track.start_angle_radians,
                arc_track.end_angle_radians,
                arc_track.side,
                entry_endpoint,
            );
            let anchored_entry = arc_track.anchor.as_ref().and_then(|anchor| {
                let &anchor_index = index_by_id.get(&anchor.entity_id)?;
                let anchor_body = bodies[anchor_index].clone();
                let geometry = anchor_endpoint_geometry(&anchor_body, anchor.endpoint)?;

                if geometry.position.sub(endpoint_geometry.position).length()
                    > ARC_ENTRY_ANCHORED_JUNCTION_POSITION_TOLERANCE
                    || geometry.tangent.dot(endpoint_geometry.tangent)
                        < ARC_ENTRY_CAPTURE_ALIGNMENT_THRESHOLD
                {
                    None
                } else {
                    Some((geometry, anchor_body))
                }
            });

            for (body_index, body) in bodies.iter_mut().enumerate() {
                if body.is_static
                    || body.shape != RuntimeBodyShape::Ball
                    || attached_arc_track_by_body_id.contains_key(&body.entity_id)
                {
                    continue;
                }

                if body.velocity.length() <= f64::EPSILON {
                    continue;
                }

                if let Some((anchor_geometry, ref anchor_body)) = anchored_entry {
                    let previous_position = previous_positions[body_index];

                    if !captures_anchored_arc_entry(
                        body,
                        previous_position,
                        anchor_body,
                        anchor_geometry,
                        endpoint_geometry,
                    ) {
                        continue;
                    }
                } else if !captures_free_arc_entry(body, endpoint_geometry) {
                    continue;
                }

                let tangential_speed = body.velocity.dot(endpoint_geometry.tangent);

                if tangential_speed <= f64::EPSILON {
                    continue;
                }

                let tangential_acceleration = body.acceleration.dot(endpoint_geometry.tangent);
                body.position = endpoint_geometry.position;
                body.velocity = endpoint_geometry.tangent.scale(tangential_speed);
                body.acceleration = endpoint_geometry.tangent.scale(tangential_acceleration);
                attached_arc_track_by_body_id.insert(body.entity_id.clone(), arc_track.id.clone());
                occupied_arc_track_ids.insert(arc_track.id.clone());
                freshly_captured_body_ids.insert(body.entity_id.clone());
                break 'body_search;
            }
        }
    }

    freshly_captured_body_ids
}

fn anchor_endpoint_geometry(
    body: &RuntimeBodyState,
    endpoint: ArcTrackAnchorEndpoint,
) -> Option<RuntimeAnchorEndpointGeometry> {
    if body.shape != RuntimeBodyShape::Box {
        return None;
    }

    let axis_x = Vector2::new(1.0, 0.0).rotated(body.rotation_radians);
    let axis_y = axis_x.perp();
    let top_center = body.position.add(axis_y.scale(-body.half_extents.y));
    let half_width_offset = axis_x.scale(body.half_extents.x);
    let surface_normal = axis_y.scale(-1.0);

    let (position, tangent) = match endpoint {
        ArcTrackAnchorEndpoint::Start => (top_center.sub(half_width_offset), axis_x.scale(-1.0)),
        ArcTrackAnchorEndpoint::End => (top_center.add(half_width_offset), axis_x),
    };

    Some(RuntimeAnchorEndpointGeometry {
        position,
        tangent,
        surface_normal,
    })
}

fn captures_free_arc_entry(
    body: &RuntimeBodyState,
    endpoint_geometry: ArcTrackEndpointGeometry,
) -> bool {
    let offset_from_entry = body.position.sub(endpoint_geometry.position);
    let speed = body.velocity.length();
    let alignment = body
        .velocity
        .scale(1.0 / speed)
        .dot(endpoint_geometry.tangent);

    offset_from_entry.length() <= ARC_ENTRY_CAPTURE_DISTANCE_THRESHOLD
        && alignment >= ARC_ENTRY_CAPTURE_ALIGNMENT_THRESHOLD
        && offset_from_entry.dot(endpoint_geometry.tangent) <= ARC_ENTRY_CAPTURE_APPROACH_TOLERANCE
        && offset_from_entry.dot(endpoint_geometry.support_direction)
            >= -ARC_ENTRY_CAPTURE_SIDE_TOLERANCE
}

fn captures_anchored_arc_entry(
    body: &RuntimeBodyState,
    previous_position: Vector2,
    anchor_body: &RuntimeBodyState,
    anchor_geometry: RuntimeAnchorEndpointGeometry,
    endpoint_geometry: ArcTrackEndpointGeometry,
) -> bool {
    let tangential_speed = body.velocity.dot(anchor_geometry.tangent);

    if tangential_speed <= f64::EPSILON {
        return false;
    }

    let previous_offset = previous_position.sub(anchor_geometry.position);
    let previous_longitudinal = previous_offset.dot(anchor_geometry.tangent);
    let overshoot_window = body.half_extents.x + ARC_ENTRY_ANCHORED_JUNCTION_OVERSHOOT_PADDING;

    let supporting_contact = contact_geometry::contact_manifold(body, anchor_body).filter(|contact| {
        body.acceleration.length() > f64::EPSILON
            && body.acceleration.dot(contact.normal) < -ARC_ENTRY_ANCHORED_SUPPORT_ACCELERATION_TOLERANCE
    });

    if let Some(contact) = supporting_contact {
        let contact_longitudinal =
            contact.point.sub(anchor_geometry.position).dot(anchor_geometry.tangent);

        if previous_longitudinal > overshoot_window
            || contact_longitudinal > overshoot_window
            || contact_longitudinal < -ARC_ENTRY_ANCHORED_JUNCTION_CROSSING_TOLERANCE
        {
            return false;
        }
    } else {
        let current_offset = body.position.sub(anchor_geometry.position);
        let expected_surface_offset = body.half_extents.x;
        let previous_surface_offset = previous_offset.dot(anchor_geometry.surface_normal);
        let current_surface_offset = current_offset.dot(anchor_geometry.surface_normal);

        if (previous_surface_offset - expected_surface_offset).abs()
            > ARC_ENTRY_ANCHORED_JUNCTION_SURFACE_TOLERANCE
            || (current_surface_offset - expected_surface_offset).abs()
                > ARC_ENTRY_ANCHORED_JUNCTION_SURFACE_TOLERANCE
        {
            return false;
        }

        let current_longitudinal = current_offset.dot(anchor_geometry.tangent);

        if previous_longitudinal > overshoot_window
            || current_longitudinal > overshoot_window
            || current_longitudinal < -ARC_ENTRY_ANCHORED_JUNCTION_CROSSING_TOLERANCE
        {
            return false;
        }
    }

    body.velocity.dot(endpoint_geometry.tangent) > f64::EPSILON
}

#[allow(clippy::too_many_arguments)]
fn enforce_arc_track_attachment(
    body: &mut RuntimeBodyState,
    center: Vector2,
    radius: f64,
    start_angle_radians: f64,
    end_angle_radians: f64,
    span_radians: f64,
    side: ArcTrackSide,
    allow_detach: bool,
) -> bool {
    let projection = crate::arc_track::project_point_to_arc(
        center,
        radius,
        start_angle_radians,
        end_angle_radians,
        span_radians,
        body.position,
    );
    let current_angle = crate::arc_track::angle_radians_for_position(body.position.sub(center))
        .unwrap_or(projection.angle_radians);

    if allow_detach
        && !crate::arc_track::angle_is_within_arc(current_angle, start_angle_radians, span_radians)
    {
        return false;
    }

    let radial = crate::arc_track::radial_for_angle(projection.angle_radians);
    let tangent = crate::arc_track::tangent_for_increasing_angle(radial);
    let tangential_speed = body.velocity.dot(tangent);
    let tangential_acceleration = body.acceleration.dot(tangent);
    let required_support = radial
        .scale(-((tangential_speed * tangential_speed) / radius + body.acceleration.dot(radial)))
        .dot(crate::arc_track::support_direction(radial, side));

    if allow_detach && required_support < -crate::arc_track::ARC_TRACK_EPSILON {
        return false;
    }

    body.position = projection.position;
    body.velocity = tangent.scale(tangential_speed);
    body.acceleration = tangent
        .scale(tangential_acceleration)
        .sub(radial.scale((tangential_speed * tangential_speed) / radius));

    true
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
