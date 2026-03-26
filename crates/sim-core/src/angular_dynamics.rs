use crate::entity::Vector2;

use super::{RuntimeBodyShape, RuntimeBodyState};

pub fn inverse_inertia_for_body(
    shape: RuntimeBodyShape,
    half_extents: Vector2,
    mass: f64,
    is_static: bool,
) -> f64 {
    if is_static || mass <= f64::EPSILON {
        return 0.0;
    }

    match shape {
        RuntimeBodyShape::Ball => 0.0,
        RuntimeBodyShape::Box => {
            let width = half_extents.x * 2.0;
            let height = half_extents.y * 2.0;
            let inertia = mass * (width * width + height * height) / 12.0;

            if inertia <= f64::EPSILON {
                0.0
            } else {
                1.0 / inertia
            }
        }
    }
}

pub fn integrate_rotation(body: &mut RuntimeBodyState, delta_seconds: f64) {
    if body.is_static {
        body.angular_velocity_radians = 0.0;
        return;
    }

    body.rotation_radians += body.angular_velocity_radians * delta_seconds;
}

pub fn velocity_at_point(body: &RuntimeBodyState, world_point: Vector2) -> Vector2 {
    let radial_offset = world_point.sub(body.position);
    body.velocity.add(radial_offset.perp().scale(body.angular_velocity_radians))
}

pub fn apply_impulse(body: &mut RuntimeBodyState, impulse: Vector2, world_point: Vector2) {
    if body.is_static {
        return;
    }

    let inverse_mass = super::inverse_mass(body);

    body.velocity = body.velocity.add(impulse.scale(inverse_mass));

    if body.inverse_inertia <= f64::EPSILON {
        return;
    }

    let radial_offset = world_point.sub(body.position);
    body.angular_velocity_radians += radial_offset.cross(impulse) * body.inverse_inertia;
}
