use crate::entity::Vector2;

use super::{RuntimeBodyShape, RuntimeBodyState};

const TILTED_SURFACE_EPSILON: f64 = 1e-6;

pub fn supports_tilted_static_surface(surface: &RuntimeBodyState) -> bool {
    surface.is_static
        && surface.shape == RuntimeBodyShape::Box
        && surface.rotation_radians.abs() > TILTED_SURFACE_EPSILON
}

pub fn contact_normal_and_penetration(
    body: &RuntimeBodyState,
    surface: &RuntimeBodyState,
) -> Option<(f64, f64, f64)> {
    let tangent = Vector2::new(
        surface.rotation_radians.cos(),
        surface.rotation_radians.sin(),
    );
    let normal = Vector2::new(-tangent.y, tangent.x);
    let relative = body.position.sub(surface.position);
    let local_tangent = relative.dot(tangent);
    let local_normal = relative.dot(normal);
    let body_tangent_extent = projected_half_extent(body, tangent);
    let body_normal_extent = projected_half_extent(body, normal);
    let overlap_tangent = surface.half_extents.x + body_tangent_extent - local_tangent.abs();
    let overlap_normal = surface.half_extents.y + body_normal_extent - local_normal.abs();

    if overlap_tangent <= 0.0 || overlap_normal <= 0.0 {
        return None;
    }

    if overlap_normal <= overlap_tangent {
        let direction = if local_normal >= 0.0 { 1.0 } else { -1.0 };

        Some((normal.x * direction, normal.y * direction, overlap_normal))
    } else {
        let direction = if local_tangent >= 0.0 { 1.0 } else { -1.0 };

        Some((
            tangent.x * direction,
            tangent.y * direction,
            overlap_tangent,
        ))
    }
}

fn projected_half_extent(body: &RuntimeBodyState, axis: Vector2) -> f64 {
    match body.shape {
        RuntimeBodyShape::Ball => body.half_extents.x,
        RuntimeBodyShape::Box => {
            body.half_extents.x * axis.x.abs() + body.half_extents.y * axis.y.abs()
        }
    }
}
