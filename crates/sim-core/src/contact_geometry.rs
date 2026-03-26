use crate::entity::Vector2;

use super::{RuntimeBodyShape, RuntimeBodyState};

const CONTACT_EPSILON: f64 = 1e-9;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ContactManifold {
    pub normal: Vector2,
    pub penetration: f64,
    pub point: Vector2,
}

pub fn contact_manifold(
    body_a: &RuntimeBodyState,
    body_b: &RuntimeBodyState,
) -> Option<ContactManifold> {
    match (body_a.shape, body_b.shape) {
        (RuntimeBodyShape::Ball, RuntimeBodyShape::Ball) => ball_ball_contact(body_a, body_b),
        (RuntimeBodyShape::Ball, RuntimeBodyShape::Box) => ball_box_contact(body_a, body_b),
        (RuntimeBodyShape::Box, RuntimeBodyShape::Ball) => {
            ball_box_contact(body_b, body_a).map(|contact| ContactManifold {
                normal: contact.normal.scale(-1.0),
                penetration: contact.penetration,
                point: contact.point,
            })
        }
        (RuntimeBodyShape::Box, RuntimeBodyShape::Box) => box_box_contact(body_a, body_b),
    }
}

pub fn projected_extent(body: &RuntimeBodyState, axis: Vector2) -> f64 {
    match body.shape {
        RuntimeBodyShape::Ball => body.half_extents.x,
        RuntimeBodyShape::Box => {
            let [axis_x, axis_y] = box_axes(body);
            body.half_extents.x * axis.dot(axis_x).abs()
                + body.half_extents.y * axis.dot(axis_y).abs()
        }
    }
}

fn ball_ball_contact(
    body_a: &RuntimeBodyState,
    body_b: &RuntimeBodyState,
) -> Option<ContactManifold> {
    let delta = body_a.position.sub(body_b.position);
    let distance = delta.length();
    let combined_radius = body_a.half_extents.x + body_b.half_extents.x;

    if distance >= combined_radius {
        return None;
    }

    let normal = if distance > CONTACT_EPSILON {
        delta.scale(1.0 / distance)
    } else {
        fallback_normal(delta, body_a.velocity.sub(body_b.velocity))
    };
    let point_a = body_a.position.sub(normal.scale(body_a.half_extents.x));
    let point_b = body_b.position.add(normal.scale(body_b.half_extents.x));

    Some(ContactManifold {
        normal,
        penetration: combined_radius - distance,
        point: point_a.add(point_b).scale(0.5),
    })
}

fn ball_box_contact(ball: &RuntimeBodyState, box_body: &RuntimeBodyState) -> Option<ContactManifold> {
    let [axis_x, axis_y] = box_axes(box_body);
    let relative = ball.position.sub(box_body.position);
    let local = Vector2::new(relative.dot(axis_x), relative.dot(axis_y));
    let clamped = Vector2::new(
        local.x.clamp(-box_body.half_extents.x, box_body.half_extents.x),
        local.y.clamp(-box_body.half_extents.y, box_body.half_extents.y),
    );
    let closest_world = box_body
        .position
        .add(axis_x.scale(clamped.x))
        .add(axis_y.scale(clamped.y));
    let separation = ball.position.sub(closest_world);
    let distance = separation.length();
    let radius = ball.half_extents.x;

    if distance > radius {
        return None;
    }

    if distance > CONTACT_EPSILON {
        return Some(ContactManifold {
            normal: separation.scale(1.0 / distance),
            penetration: radius - distance,
            point: closest_world,
        });
    }

    let distance_to_face_x = box_body.half_extents.x - local.x.abs();
    let distance_to_face_y = box_body.half_extents.y - local.y.abs();

    if distance_to_face_x <= distance_to_face_y {
        let direction = if local.x >= 0.0 { 1.0 } else { -1.0 };
        let normal = axis_x.scale(direction);
        let point = box_body
            .position
            .add(axis_x.scale(box_body.half_extents.x * direction))
            .add(axis_y.scale(local.y.clamp(-box_body.half_extents.y, box_body.half_extents.y)));

        Some(ContactManifold {
            normal,
            penetration: radius + distance_to_face_x,
            point,
        })
    } else {
        let direction = if local.y >= 0.0 { 1.0 } else { -1.0 };
        let normal = axis_y.scale(direction);
        let point = box_body
            .position
            .add(axis_x.scale(local.x.clamp(-box_body.half_extents.x, box_body.half_extents.x)))
            .add(axis_y.scale(box_body.half_extents.y * direction));

        Some(ContactManifold {
            normal,
            penetration: radius + distance_to_face_y,
            point,
        })
    }
}

fn box_box_contact(
    body_a: &RuntimeBodyState,
    body_b: &RuntimeBodyState,
) -> Option<ContactManifold> {
    let delta = body_a.position.sub(body_b.position);
    let axes_a = box_axes(body_a);
    let axes_b = box_axes(body_b);
    let mut best_axis = None;
    let mut best_overlap = f64::INFINITY;

    for axis in axes_a.into_iter().chain(axes_b) {
        let normalized_axis = axis.normalized();
        let center_distance = delta.dot(normalized_axis);
        let overlap = projected_extent(body_a, normalized_axis)
            + projected_extent(body_b, normalized_axis)
            - center_distance.abs();

        if overlap <= 0.0 {
            return None;
        }

        if overlap < best_overlap {
            let direction = if center_distance >= 0.0 { 1.0 } else { -1.0 };
            best_overlap = overlap;
            best_axis = Some(normalized_axis.scale(direction));
        }
    }

    let normal = best_axis?;
    let tangent = normal.perp();
    let extent_a_normal = projected_extent(body_a, normal);
    let extent_b_normal = projected_extent(body_b, normal);
    let extent_a_tangent = projected_extent(body_a, tangent);
    let extent_b_tangent = projected_extent(body_b, tangent);
    let min_a_tangent = body_a.position.dot(tangent) - extent_a_tangent;
    let max_a_tangent = body_a.position.dot(tangent) + extent_a_tangent;
    let min_b_tangent = body_b.position.dot(tangent) - extent_b_tangent;
    let max_b_tangent = body_b.position.dot(tangent) + extent_b_tangent;
    let overlap_tangent_min = min_a_tangent.max(min_b_tangent);
    let overlap_tangent_max = max_a_tangent.min(max_b_tangent);
    let tangent_coordinate = (overlap_tangent_min + overlap_tangent_max) * 0.5;
    let face_a_coordinate = body_a.position.dot(normal) - extent_a_normal;
    let face_b_coordinate = body_b.position.dot(normal) + extent_b_normal;
    let normal_coordinate = (face_a_coordinate + face_b_coordinate) * 0.5;
    let point = normal
        .scale(normal_coordinate)
        .add(tangent.scale(tangent_coordinate));

    Some(ContactManifold {
        normal,
        penetration: best_overlap,
        point,
    })
}

fn box_axes(body: &RuntimeBodyState) -> [Vector2; 2] {
    let axis_x = Vector2::new(1.0, 0.0).rotated(body.rotation_radians);
    let axis_y = axis_x.perp();
    [axis_x, axis_y]
}

fn fallback_normal(delta: Vector2, relative_velocity: Vector2) -> Vector2 {
    if relative_velocity.length() > CONTACT_EPSILON {
        relative_velocity.scale(-1.0).normalized()
    } else if delta.length() > CONTACT_EPSILON {
        delta.normalized()
    } else {
        Vector2::new(0.0, 1.0)
    }
}
