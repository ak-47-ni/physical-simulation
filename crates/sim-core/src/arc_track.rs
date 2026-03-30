use std::f64::consts::PI;

use crate::entity::Vector2;

pub const ARC_TRACK_EPSILON: f64 = 1e-6;
const TWO_PI: f64 = PI * 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArcTrackProjection {
    pub position: Vector2,
    pub angle_radians: f64,
}

pub fn validated_arc_angles(
    start_angle_degrees: f64,
    end_angle_degrees: f64,
) -> Option<(f64, f64, f64)> {
    if !start_angle_degrees.is_finite() || !end_angle_degrees.is_finite() {
        return None;
    }

    let start_angle_radians = normalize_angle_radians(start_angle_degrees.to_radians());
    let end_angle_radians = normalize_angle_radians(end_angle_degrees.to_radians());
    let span_radians = ccw_span_radians(start_angle_radians, end_angle_radians);

    if span_radians <= ARC_TRACK_EPSILON || (TWO_PI - span_radians) <= ARC_TRACK_EPSILON {
        None
    } else {
        Some((start_angle_radians, end_angle_radians, span_radians))
    }
}

pub fn project_point_to_arc(
    center: Vector2,
    radius: f64,
    start_angle_radians: f64,
    end_angle_radians: f64,
    span_radians: f64,
    point: Vector2,
) -> ArcTrackProjection {
    let raw_angle = angle_radians_for_position(point.sub(center)).unwrap_or(start_angle_radians);
    let angle_radians = if angle_is_within_arc(raw_angle, start_angle_radians, span_radians) {
        raw_angle
    } else {
        clamp_angle_to_arc(raw_angle, start_angle_radians, end_angle_radians)
    };

    ArcTrackProjection {
        position: center.add(radial_for_angle(angle_radians).scale(radius)),
        angle_radians,
    }
}

pub fn angle_radians_for_position(relative: Vector2) -> Option<f64> {
    if relative.length() <= ARC_TRACK_EPSILON {
        None
    } else {
        Some(normalize_angle_radians(relative.y.atan2(relative.x)))
    }
}

pub fn radial_for_angle(angle_radians: f64) -> Vector2 {
    Vector2::new(angle_radians.cos(), angle_radians.sin())
}

pub fn angle_is_within_arc(
    angle_radians: f64,
    start_angle_radians: f64,
    span_radians: f64,
) -> bool {
    ccw_span_radians(start_angle_radians, normalize_angle_radians(angle_radians))
        <= span_radians + ARC_TRACK_EPSILON
}

fn clamp_angle_to_arc(angle_radians: f64, start_angle_radians: f64, end_angle_radians: f64) -> f64 {
    let distance_to_start = shortest_angle_distance(angle_radians, start_angle_radians);
    let distance_to_end = shortest_angle_distance(angle_radians, end_angle_radians);

    if distance_to_start <= distance_to_end {
        start_angle_radians
    } else {
        end_angle_radians
    }
}

fn normalize_angle_radians(angle_radians: f64) -> f64 {
    let mut normalized = angle_radians % TWO_PI;

    if normalized < 0.0 {
        normalized += TWO_PI;
    }

    normalized
}

fn ccw_span_radians(start_angle_radians: f64, end_angle_radians: f64) -> f64 {
    normalize_angle_radians(end_angle_radians - start_angle_radians)
}

fn shortest_angle_distance(a: f64, b: f64) -> f64 {
    let ccw_distance = ccw_span_radians(a, b);
    ccw_distance.min(TWO_PI - ccw_distance)
}
