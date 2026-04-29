#[path = "angular_dynamics.rs"]
mod angular_dynamics;

#[path = "contact_budget.rs"]
mod contact_budget;

#[path = "contact_geometry.rs"]
mod contact_geometry;

use std::collections::{HashMap, HashSet};

use crate::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackCapturePolicy, ArcTrackEndpointGeometry, CompiledArcTrack,
    effective_center_radius,
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
const DETACHED_CONTACT_MIN_EXTENT_EPSILON: f64 = 1e-3;
const DETACHED_CONTACT_TARGET_TRAVEL_EXTENT_FRACTION: f64 = 0.25;
const DETACHED_CONTACT_MAX_SUBSTEPS: usize = 64;
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

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeArcTrackAttachment {
    pub arc_track_id: String,
    pub angle_radians: f64,
    pub tangential_speed: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeArcTrackDetachEvent {
    pub body_id: String,
    pub elapsed_seconds: f64,
    pub body: RuntimeBodyState,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct RuntimeArcEntryCapture {
    hit_seconds: f64,
    angle_radians: f64,
    tangential_speed: f64,
}

#[derive(Debug, Clone, PartialEq, Default)]
struct ArcTrackAdvanceReport {
    detached_body_remaining_seconds_by_id: HashMap<String, f64>,
    detach_events: Vec<RuntimeArcTrackDetachEvent>,
}

pub fn step_bodies(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    arc_tracks: &[CompiledArcTrack],
    attached_arc_track_by_body_id: &mut HashMap<String, RuntimeArcTrackAttachment>,
    guide_attached_body_ids: &HashSet<String>,
    gravity: Vector2,
    delta_seconds: f64,
) -> Vec<RuntimeArcTrackDetachEvent> {
    let previous_positions = bodies.iter().map(|body| body.position).collect::<Vec<_>>();
    let attached_body_ids = attached_arc_track_by_body_id
        .keys()
        .cloned()
        .chain(guide_attached_body_ids.iter().cloned())
        .collect::<HashSet<_>>();
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
        if body.is_static || attached_body_ids.contains(&body.entity_id) {
            continue;
        }

        integrate_free_body(body, delta_seconds);
    }

    resolve_static_contacts(bodies, &static_surfaces, &attached_body_ids, delta_seconds);
    resolve_dynamic_contacts(bodies, &static_surfaces, &attached_body_ids, delta_seconds);
    enforce_linear_track_bindings(bodies, constraints, &index_by_id);
    let mut attachment_delta_seconds_by_body_id = attached_arc_track_by_body_id
        .keys()
        .cloned()
        .map(|body_id| (body_id, delta_seconds))
        .collect::<HashMap<_, _>>();
    let newly_captured_body_ids = capture_arc_entries(
        bodies,
        arc_tracks,
        &index_by_id,
        &previous_positions,
        attached_arc_track_by_body_id,
        &attached_body_ids,
        delta_seconds,
    );
    attachment_delta_seconds_by_body_id.extend(newly_captured_body_ids);
    let arc_track_advance_report = advance_arc_track_attachments(
        bodies,
        arc_tracks,
        &index_by_id,
        attached_arc_track_by_body_id,
        &attachment_delta_seconds_by_body_id,
    );
    resolve_recently_detached_bodies(
        bodies,
        &arc_track_advance_report.detached_body_remaining_seconds_by_id,
    );

    arc_track_advance_report.detach_events
}

pub fn project_track_bindings(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    _arc_tracks: &[CompiledArcTrack],
    _attached_arc_track_by_body_id: &HashMap<String, RuntimeArcTrackAttachment>,
) {
    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.clone(), index))
        .collect::<HashMap<_, _>>();

    enforce_linear_track_bindings(bodies, constraints, &index_by_id);
}

pub fn resolve_recently_detached_bodies(
    bodies: &mut [RuntimeBodyState],
    detached_body_delta_seconds_by_id: &HashMap<String, f64>,
) {
    if detached_body_delta_seconds_by_id.is_empty() {
        return;
    }

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

    for (body_id, delta_seconds) in detached_body_delta_seconds_by_id {
        if *delta_seconds <= f64::EPSILON {
            continue;
        }

        let Some(&index) = index_by_id.get(body_id) else {
            continue;
        };
        let body = &mut bodies[index];

        if body.is_static {
            continue;
        }

        let mut contact_budget_bodies = static_surfaces.clone();
        contact_budget_bodies.push(body.clone());
        let substep_count = contact_budget::recommended_substep_count_for_bodies(
            &contact_budget_bodies,
            *delta_seconds,
        )
        .max(recently_detached_contact_substep_count(
            body,
            &static_surfaces,
            *delta_seconds,
        ));
        let substep_seconds = *delta_seconds / substep_count as f64;

        for _ in 0..substep_count {
            integrate_free_body(body, substep_seconds);
            resolve_implicit_boundaries(body, substep_seconds);

            for surface in &static_surfaces {
                resolve_contact_with_surface(body, surface, substep_seconds);
            }

            resolve_implicit_boundaries(body, substep_seconds);
        }
    }
}

fn recently_detached_contact_substep_count(
    body: &RuntimeBodyState,
    static_surfaces: &[RuntimeBodyState],
    delta_seconds: f64,
) -> usize {
    if delta_seconds <= f64::EPSILON {
        return 1;
    }

    let travel = detached_contact_predicted_travel(body, delta_seconds);

    if travel <= f64::EPSILON || !travel.is_finite() {
        return 1;
    }

    let mut min_extent = detached_contact_minimum_extent(body);

    for surface in static_surfaces {
        if surface.shape != RuntimeBodyShape::ArcTrack {
            continue;
        }

        let Some(arc_track) = surface.arc_track else {
            continue;
        };
        min_extent = min_extent
            .min((arc_track.half_thickness * 2.0).max(DETACHED_CONTACT_MIN_EXTENT_EPSILON));
    }

    let target_travel = min_extent * DETACHED_CONTACT_TARGET_TRAVEL_EXTENT_FRACTION;
    let required_substeps = (travel / target_travel).ceil() as usize;

    required_substeps.clamp(1, DETACHED_CONTACT_MAX_SUBSTEPS)
}

fn detached_contact_predicted_travel(body: &RuntimeBodyState, delta_seconds: f64) -> f64 {
    let speed = body.velocity.length();
    let acceleration = body.acceleration.length();
    let travel = speed * delta_seconds + 0.5 * acceleration * delta_seconds * delta_seconds;

    if travel.is_finite() {
        travel.max(0.0)
    } else {
        0.0
    }
}

fn detached_contact_minimum_extent(body: &RuntimeBodyState) -> f64 {
    let extent = body.half_extents.x.min(body.half_extents.y) * 2.0;

    if extent.is_finite() && extent > f64::EPSILON {
        extent
    } else {
        DETACHED_CONTACT_MIN_EXTENT_EPSILON
    }
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
    attached_body_ids: &HashSet<String>,
    delta_seconds: f64,
) {
    for body in bodies.iter_mut() {
        if body.is_static || attached_body_ids.contains(&body.entity_id) {
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
    attached_body_ids: &HashSet<String>,
    delta_seconds: f64,
) {
    for _ in 0..DYNAMIC_CONTACT_PASSES {
        for index_a in 0..bodies.len() {
            for index_b in (index_a + 1)..bodies.len() {
                let (body_a, body_b) = get_body_pair_mut(bodies, index_a, index_b);

                if body_a.is_static
                    || body_b.is_static
                    || attached_body_ids.contains(&body_a.entity_id)
                    || attached_body_ids.contains(&body_b.entity_id)
                {
                    continue;
                }

                resolve_contact_pair(body_a, body_b, delta_seconds);
            }
        }

        resolve_static_contacts(bodies, static_surfaces, attached_body_ids, delta_seconds);
    }
}

fn integrate_free_body(body: &mut RuntimeBodyState, delta_seconds: f64) {
    body.position = body
        .position
        .add(body.velocity.scale(delta_seconds))
        .add(body.acceleration.scale(0.5 * delta_seconds * delta_seconds));
    body.velocity = body.velocity.add(body.acceleration.scale(delta_seconds));
    angular_dynamics::integrate_rotation(body, delta_seconds);
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

fn enforce_linear_track_bindings(
    bodies: &mut [RuntimeBodyState],
    constraints: &[CompiledConstraint],
    index_by_id: &HashMap<String, usize>,
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
}

fn advance_arc_track_attachments(
    bodies: &mut [RuntimeBodyState],
    arc_tracks: &[CompiledArcTrack],
    index_by_id: &HashMap<String, usize>,
    attached_arc_track_by_body_id: &mut HashMap<String, RuntimeArcTrackAttachment>,
    attachment_delta_seconds_by_body_id: &HashMap<String, f64>,
) -> ArcTrackAdvanceReport {
    let mut report = ArcTrackAdvanceReport::default();
    let attached_body_ids = attached_arc_track_by_body_id
        .keys()
        .cloned()
        .collect::<Vec<_>>();

    for body_id in attached_body_ids {
        let Some(&index) = index_by_id.get(&body_id) else {
            attached_arc_track_by_body_id.remove(&body_id);
            continue;
        };
        let Some(step_seconds) = attachment_delta_seconds_by_body_id.get(&body_id).copied() else {
            continue;
        };
        let Some(mut attachment) = attached_arc_track_by_body_id.get(&body_id).cloned() else {
            continue;
        };
        let Some(arc_track) = arc_tracks
            .iter()
            .find(|arc_track| arc_track.id == attachment.arc_track_id)
        else {
            attached_arc_track_by_body_id.remove(&body_id);
            continue;
        };
        let body = &mut bodies[index];

        match advance_arc_track_attachment(body, arc_track, &mut attachment, step_seconds) {
            ArcTrackAttachmentAdvanceResult::StillAttached => {
                attached_arc_track_by_body_id.insert(body_id, attachment);
            }
            ArcTrackAttachmentAdvanceResult::Detached {
                remaining_seconds,
                release_seconds,
            } => {
                attached_arc_track_by_body_id.remove(&body_id);
                if remaining_seconds > f64::EPSILON {
                    report
                        .detached_body_remaining_seconds_by_id
                        .insert(body_id.clone(), remaining_seconds);
                }
                report.detach_events.push(RuntimeArcTrackDetachEvent {
                    body_id,
                    elapsed_seconds: release_seconds.clamp(0.0, step_seconds),
                    body: body.clone(),
                });
            }
        }
    }

    report
}

fn capture_arc_entries(
    bodies: &mut [RuntimeBodyState],
    arc_tracks: &[CompiledArcTrack],
    index_by_id: &HashMap<String, usize>,
    previous_positions: &[Vector2],
    attached_arc_track_by_body_id: &mut HashMap<String, RuntimeArcTrackAttachment>,
    attached_body_ids: &HashSet<String>,
    delta_seconds: f64,
) -> HashMap<String, f64> {
    let mut newly_captured_body_ids = HashMap::new();
    let mut occupied_arc_track_ids = attached_arc_track_by_body_id
        .values()
        .map(|attachment| attachment.arc_track_id.clone())
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
                arc_track.contact_path_radius(),
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
                    || attached_body_ids.contains(&body.entity_id)
                {
                    continue;
                }

                if body.velocity.length() <= f64::EPSILON {
                    continue;
                }

                let capture = if let Some((anchor_geometry, ref anchor_body)) = anchored_entry {
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
                    Some(RuntimeArcEntryCapture {
                        hit_seconds: delta_seconds,
                        angle_radians: endpoint_geometry.angle_radians,
                        tangential_speed: signed_tangential_speed_for_angle(
                            body.velocity,
                            endpoint_geometry.angle_radians,
                        ),
                    })
                } else {
                    capture_free_arc_entry(
                        previous_positions[body_index],
                        body,
                        endpoint_geometry,
                        delta_seconds,
                    )
                };
                let Some(capture) = capture else {
                    continue;
                };
                let body_id = body.entity_id.clone();
                sync_body_to_arc_state(
                    body,
                    arc_track,
                    capture.angle_radians,
                    capture.tangential_speed,
                );
                attached_arc_track_by_body_id.insert(
                    body_id.clone(),
                    RuntimeArcTrackAttachment {
                        arc_track_id: arc_track.id.clone(),
                        angle_radians: capture.angle_radians,
                        tangential_speed: capture.tangential_speed,
                    },
                );
                occupied_arc_track_ids.insert(arc_track.id.clone());
                newly_captured_body_ids
                    .insert(body_id, (delta_seconds - capture.hit_seconds).max(0.0));
                break 'body_search;
            }
        }
    }

    newly_captured_body_ids
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

fn capture_free_arc_entry(
    previous_position: Vector2,
    body: &RuntimeBodyState,
    endpoint_geometry: ArcTrackEndpointGeometry,
    delta_seconds: f64,
) -> Option<RuntimeArcEntryCapture> {
    let speed = body.velocity.length();
    let body_radius = body.half_extents.x.max(body.half_extents.y);
    let entry_center_position = endpoint_geometry
        .position
        .add(endpoint_geometry.support_direction.scale(body_radius));

    if speed <= f64::EPSILON {
        return None;
    }

    let alignment = body
        .velocity
        .scale(1.0 / speed)
        .dot(endpoint_geometry.tangent);

    if alignment < ARC_ENTRY_CAPTURE_ALIGNMENT_THRESHOLD {
        return None;
    }

    let previous_offset = previous_position.sub(entry_center_position);
    let offset_from_entry = body.position.sub(entry_center_position);
    let previous_longitudinal = previous_offset.dot(endpoint_geometry.tangent);
    let current_longitudinal = offset_from_entry.dot(endpoint_geometry.tangent);
    let sweep_longitudinal = current_longitudinal - previous_longitudinal;

    if sweep_longitudinal > f64::EPSILON
        && previous_longitudinal < -crate::arc_track::ARC_TRACK_EPSILON
        && current_longitudinal >= -crate::arc_track::ARC_TRACK_EPSILON
    {
        let hit_fraction = (-previous_longitudinal / sweep_longitudinal).clamp(0.0, 1.0);
        let hit_offset =
            previous_offset.add(offset_from_entry.sub(previous_offset).scale(hit_fraction));
        let hit_side = hit_offset.dot(endpoint_geometry.support_direction);

        if hit_offset.length()
            <= ARC_ENTRY_CAPTURE_DISTANCE_THRESHOLD + crate::arc_track::ARC_TRACK_EPSILON
            && hit_side.abs() <= ARC_ENTRY_CAPTURE_SIDE_TOLERANCE
        {
            let hit_seconds = hit_fraction * delta_seconds;
            let hit_velocity = body.velocity.sub(
                body.acceleration
                    .scale((delta_seconds - hit_seconds).max(0.0)),
            );

            return Some(RuntimeArcEntryCapture {
                hit_seconds,
                angle_radians: endpoint_geometry.angle_radians,
                tangential_speed: signed_tangential_speed_for_angle(
                    hit_velocity,
                    endpoint_geometry.angle_radians,
                ),
            });
        }
    }

    if previous_longitudinal < -crate::arc_track::ARC_TRACK_EPSILON
        && captures_free_arc_entry_window(offset_from_entry, endpoint_geometry)
    {
        Some(RuntimeArcEntryCapture {
            hit_seconds: delta_seconds,
            angle_radians: endpoint_geometry.angle_radians,
            tangential_speed: signed_tangential_speed_for_angle(
                body.velocity,
                endpoint_geometry.angle_radians,
            ),
        })
    } else {
        None
    }
}

fn captures_free_arc_entry_window(
    offset_from_entry: Vector2,
    endpoint_geometry: ArcTrackEndpointGeometry,
) -> bool {
    offset_from_entry.length() <= ARC_ENTRY_CAPTURE_DISTANCE_THRESHOLD
        && offset_from_entry.dot(endpoint_geometry.tangent) <= ARC_ENTRY_CAPTURE_APPROACH_TOLERANCE
        && offset_from_entry
            .dot(endpoint_geometry.support_direction)
            .abs()
            <= ARC_ENTRY_CAPTURE_SIDE_TOLERANCE
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

    let supporting_contact =
        contact_geometry::contact_manifold(body, anchor_body).filter(|contact| {
            body.acceleration.length() > f64::EPSILON
                && body.acceleration.dot(contact.normal)
                    < -ARC_ENTRY_ANCHORED_SUPPORT_ACCELERATION_TOLERANCE
        });

    if let Some(contact) = supporting_contact {
        let contact_longitudinal = contact
            .point
            .sub(anchor_geometry.position)
            .dot(anchor_geometry.tangent);

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

fn signed_tangential_speed_for_angle(velocity: Vector2, angle_radians: f64) -> f64 {
    let radial = crate::arc_track::radial_for_angle(angle_radians);
    let tangent = crate::arc_track::tangent_for_increasing_angle(radial);

    velocity.dot(tangent)
}

fn sync_body_to_arc_state(
    body: &mut RuntimeBodyState,
    arc_track: &CompiledArcTrack,
    angle_radians: f64,
    tangential_speed: f64,
) {
    let radial = crate::arc_track::radial_for_angle(angle_radians);
    let tangent = crate::arc_track::tangent_for_increasing_angle(radial);
    let tangential_acceleration = body.acceleration.dot(tangent);
    let body_radius = body.half_extents.x.max(body.half_extents.y);
    let effective_radius =
        effective_center_radius(arc_track.contact_path_radius(), body_radius, arc_track.side);

    body.position = arc_track.center.add(radial.scale(effective_radius));
    body.velocity = tangent.scale(tangential_speed);
    body.acceleration = tangent
        .scale(tangential_acceleration)
        .sub(radial.scale((tangential_speed * tangential_speed) / effective_radius));
    body.angular_velocity_radians = 0.0;
}

fn required_arc_track_support(
    external_acceleration: Vector2,
    tangential_speed: f64,
    radial: Vector2,
    radius: f64,
    side: ArcTrackSide,
) -> f64 {
    radial
        .scale(
            -((tangential_speed * tangential_speed) / radius + external_acceleration.dot(radial)),
        )
        .dot(crate::arc_track::support_direction(radial, side))
}

fn advance_arc_track_attachment(
    body: &mut RuntimeBodyState,
    arc_track: &CompiledArcTrack,
    attachment: &mut RuntimeArcTrackAttachment,
    delta_seconds: f64,
) -> ArcTrackAttachmentAdvanceResult {
    let body_radius = body.half_extents.x.max(body.half_extents.y);
    let effective_radius =
        effective_center_radius(arc_track.contact_path_radius(), body_radius, arc_track.side);

    if delta_seconds <= f64::EPSILON {
        sync_body_to_arc_state(
            body,
            arc_track,
            attachment.angle_radians,
            attachment.tangential_speed,
        );
        return ArcTrackAttachmentAdvanceResult::StillAttached;
    }

    let external_acceleration = body.acceleration;
    let radial = crate::arc_track::radial_for_angle(attachment.angle_radians);
    let tangent = crate::arc_track::tangent_for_increasing_angle(radial);
    let tangential_acceleration = external_acceleration.dot(tangent);
    let turning_point_reversal = speed_crosses_zero_within_step(
        attachment.tangential_speed,
        tangential_acceleration,
        delta_seconds,
    );
    let required_support = required_arc_track_support(
        external_acceleration,
        attachment.tangential_speed,
        radial,
        effective_radius,
        arc_track.side,
    );

    if required_support < -crate::arc_track::ARC_TRACK_EPSILON && !turning_point_reversal {
        body.position = arc_track.center.add(radial.scale(effective_radius));
        body.velocity = tangent.scale(attachment.tangential_speed);
        body.acceleration = external_acceleration;
        return ArcTrackAttachmentAdvanceResult::Detached {
            remaining_seconds: delta_seconds,
            release_seconds: 0.0,
        };
    }

    let current_progress =
        ccw_span_radians(arc_track.start_angle_radians, attachment.angle_radians);
    let angular_displacement = (attachment.tangential_speed * delta_seconds
        + 0.5 * tangential_acceleration * delta_seconds * delta_seconds)
        / effective_radius;
    let next_progress = current_progress + angular_displacement;

    if next_progress < 0.0 || next_progress > arc_track.span_radians {
        let boundary_progress = if next_progress < 0.0 {
            0.0
        } else {
            arc_track.span_radians
        };
        let boundary_angle = if boundary_progress <= 0.0 {
            arc_track.start_angle_radians
        } else {
            arc_track.end_angle_radians
        };
        let boundary_distance = (boundary_progress - current_progress) * effective_radius;
        let hit_seconds = solve_arc_boundary_hit_seconds(
            attachment.tangential_speed,
            tangential_acceleration,
            boundary_distance,
            delta_seconds,
        );
        let release_speed = attachment.tangential_speed + tangential_acceleration * hit_seconds;
        let release_radial = crate::arc_track::radial_for_angle(boundary_angle);
        let release_tangent = crate::arc_track::tangent_for_increasing_angle(release_radial);
        let remaining_seconds = (delta_seconds - hit_seconds).max(0.0);

        body.position = arc_track.center.add(release_radial.scale(effective_radius));
        body.velocity = release_tangent.scale(release_speed);
        body.acceleration = external_acceleration;
        return ArcTrackAttachmentAdvanceResult::Detached {
            remaining_seconds,
            release_seconds: hit_seconds,
        };
    }

    let next_angle = normalize_angle_radians(arc_track.start_angle_radians + next_progress);
    let next_speed = attachment.tangential_speed + tangential_acceleration * delta_seconds;
    let next_radial = crate::arc_track::radial_for_angle(next_angle);
    let next_required_support = required_arc_track_support(
        external_acceleration,
        next_speed,
        next_radial,
        effective_radius,
        arc_track.side,
    );

    if next_required_support < -crate::arc_track::ARC_TRACK_EPSILON && !turning_point_reversal {
        let release_fraction =
            (required_support / (required_support - next_required_support)).clamp(0.0, 1.0);
        let release_seconds = delta_seconds * release_fraction;
        let release_progress = current_progress
            + (attachment.tangential_speed * release_seconds
                + 0.5 * tangential_acceleration * release_seconds * release_seconds)
                / effective_radius;
        let release_angle =
            normalize_angle_radians(arc_track.start_angle_radians + release_progress);
        let release_speed = attachment.tangential_speed + tangential_acceleration * release_seconds;
        let release_radial = crate::arc_track::radial_for_angle(release_angle);
        let release_tangent = crate::arc_track::tangent_for_increasing_angle(release_radial);
        let remaining_seconds = (delta_seconds - release_seconds).max(0.0);

        body.position = arc_track.center.add(release_radial.scale(effective_radius));
        body.velocity = release_tangent.scale(release_speed);
        body.acceleration = external_acceleration;
        return ArcTrackAttachmentAdvanceResult::Detached {
            remaining_seconds,
            release_seconds,
        };
    }

    attachment.angle_radians = next_angle;
    attachment.tangential_speed = next_speed;
    sync_body_to_arc_state(body, arc_track, next_angle, next_speed);

    ArcTrackAttachmentAdvanceResult::StillAttached
}

fn speed_crosses_zero_within_step(
    speed: f64,
    tangential_acceleration: f64,
    delta_seconds: f64,
) -> bool {
    if delta_seconds <= f64::EPSILON || tangential_acceleration.abs() <= f64::EPSILON {
        return false;
    }

    if speed.abs() <= crate::arc_track::ARC_TRACK_EPSILON {
        return true;
    }

    if speed * tangential_acceleration >= 0.0 {
        return false;
    }

    let zero_cross_seconds = -speed / tangential_acceleration;

    zero_cross_seconds >= 0.0 && zero_cross_seconds <= delta_seconds
}

enum ArcTrackAttachmentAdvanceResult {
    StillAttached,
    Detached {
        remaining_seconds: f64,
        release_seconds: f64,
    },
}

fn solve_arc_boundary_hit_seconds(
    initial_speed: f64,
    tangential_acceleration: f64,
    target_distance: f64,
    max_seconds: f64,
) -> f64 {
    if target_distance.abs() <= f64::EPSILON {
        return 0.0;
    }

    if tangential_acceleration.abs() <= f64::EPSILON {
        return (target_distance / initial_speed).clamp(0.0, max_seconds);
    }

    let discriminant =
        initial_speed * initial_speed + 2.0 * tangential_acceleration * target_distance;

    if discriminant < 0.0 {
        return max_seconds;
    }

    let sqrt_discriminant = discriminant.sqrt();
    let candidates = [
        (-initial_speed + sqrt_discriminant) / tangential_acceleration,
        (-initial_speed - sqrt_discriminant) / tangential_acceleration,
    ];

    candidates
        .into_iter()
        .filter(|candidate| candidate.is_finite())
        .filter(|candidate| *candidate >= -f64::EPSILON && *candidate <= max_seconds + f64::EPSILON)
        .min_by(|left, right| left.partial_cmp(right).expect("times should compare"))
        .unwrap_or(max_seconds)
        .clamp(0.0, max_seconds)
}

fn normalize_angle_radians(angle_radians: f64) -> f64 {
    let mut normalized = angle_radians % (std::f64::consts::PI * 2.0);

    if normalized < 0.0 {
        normalized += std::f64::consts::PI * 2.0;
    }

    normalized
}

fn ccw_span_radians(start_angle_radians: f64, end_angle_radians: f64) -> f64 {
    normalize_angle_radians(end_angle_radians - start_angle_radians)
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
