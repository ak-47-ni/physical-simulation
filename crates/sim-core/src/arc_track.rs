use std::f64::consts::PI;

use crate::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, CompiledConstraint};
use crate::entity::Vector2;

pub const ARC_TRACK_EPSILON: f64 = 1e-6;
const TWO_PI: f64 = PI * 2.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArcTrackCapturePolicy {
    Start,
    End,
    Either,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArcTrackAnchorEntityKind {
    Board,
    Block,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArcTrackAnchorEndpoint {
    Start,
    End,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledArcTrackAnchor {
    pub entity_id: String,
    pub entity_kind: ArcTrackAnchorEntityKind,
    pub endpoint: ArcTrackAnchorEndpoint,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArcTrackEntityCompileMetadata {
    pub anchor: Option<CompiledArcTrackAnchor>,
    pub entry_endpoint: Option<ArcTrackEntryEndpoint>,
}

impl ArcTrackEntityCompileMetadata {
    pub fn capture_policy(&self) -> ArcTrackCapturePolicy {
        capture_policy_for_entry_endpoint(self.entry_endpoint)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledArcTrack {
    pub id: String,
    pub center: Vector2,
    pub radius: f64,
    pub start_angle_radians: f64,
    pub end_angle_radians: f64,
    pub span_radians: f64,
    pub side: ArcTrackSide,
    pub capture_policy: ArcTrackCapturePolicy,
    pub anchor: Option<CompiledArcTrackAnchor>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArcTrackProjection {
    pub position: Vector2,
    pub angle_radians: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArcTrackEndpointGeometry {
    pub angle_radians: f64,
    pub position: Vector2,
    pub tangent: Vector2,
    pub support_direction: Vector2,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LocalTangentHandoffGeometry {
    pub position: Vector2,
    pub tangent: Vector2,
    pub surface_normal: Vector2,
}

impl CompiledArcTrack {
    pub fn local_tangent_handoff_geometry(
        &self,
        entry_endpoint: ArcTrackEntryEndpoint,
    ) -> LocalTangentHandoffGeometry {
        arc_track_local_tangent_handoff_geometry(
            self.center,
            self.radius,
            self.start_angle_radians,
            self.end_angle_radians,
            self.side,
            entry_endpoint,
        )
    }
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

pub fn validated_arc_start_and_span(
    start_angle_radians: f64,
    span_degrees: f64,
) -> Option<(f64, f64, f64)> {
    if !start_angle_radians.is_finite() || !span_degrees.is_finite() {
        return None;
    }

    let span_radians = span_degrees.to_radians();

    if span_radians <= ARC_TRACK_EPSILON || span_radians >= TWO_PI - ARC_TRACK_EPSILON {
        return None;
    }

    let start_angle_radians = normalize_angle_radians(start_angle_radians);
    let end_angle_radians = normalize_angle_radians(start_angle_radians + span_radians);

    Some((start_angle_radians, end_angle_radians, span_radians))
}

pub fn compiled_arc_track_from_constraint(
    constraint: &CompiledConstraint,
) -> Option<CompiledArcTrack> {
    let CompiledConstraint::ArcTrack {
        id,
        center,
        radius,
        start_angle_radians,
        end_angle_radians,
        span_radians,
        side,
        entry_endpoint,
    } = constraint
    else {
        return None;
    };

    Some(CompiledArcTrack {
        id: id.clone(),
        center: *center,
        radius: *radius,
        start_angle_radians: *start_angle_radians,
        end_angle_radians: *end_angle_radians,
        span_radians: *span_radians,
        side: *side,
        capture_policy: capture_policy_for_entry_endpoint(Some(*entry_endpoint)),
        anchor: None,
    })
}

pub fn capture_policy_for_entry_endpoint(
    entry_endpoint: Option<ArcTrackEntryEndpoint>,
) -> ArcTrackCapturePolicy {
    match entry_endpoint {
        Some(ArcTrackEntryEndpoint::Start) => ArcTrackCapturePolicy::Start,
        Some(ArcTrackEntryEndpoint::End) => ArcTrackCapturePolicy::End,
        None => ArcTrackCapturePolicy::Either,
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

pub fn endpoint_geometry(
    center: Vector2,
    radius: f64,
    start_angle_radians: f64,
    end_angle_radians: f64,
    side: ArcTrackSide,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> ArcTrackEndpointGeometry {
    let angle_radians = match entry_endpoint {
        ArcTrackEntryEndpoint::Start => start_angle_radians,
        ArcTrackEntryEndpoint::End => end_angle_radians,
    };
    let radial = radial_for_angle(angle_radians);
    let increasing_tangent = tangent_for_increasing_angle(radial);
    let tangent = match entry_endpoint {
        ArcTrackEntryEndpoint::Start => increasing_tangent,
        ArcTrackEntryEndpoint::End => increasing_tangent.scale(-1.0),
    };

    ArcTrackEndpointGeometry {
        angle_radians,
        position: center.add(radial.scale(radius)),
        tangent,
        support_direction: support_direction(radial, side),
    }
}

pub fn arc_track_local_tangent_handoff_geometry(
    center: Vector2,
    radius: f64,
    start_angle_radians: f64,
    end_angle_radians: f64,
    side: ArcTrackSide,
    entry_endpoint: ArcTrackEntryEndpoint,
) -> LocalTangentHandoffGeometry {
    let endpoint = endpoint_geometry(
        center,
        radius,
        start_angle_radians,
        end_angle_radians,
        side,
        entry_endpoint,
    );

    LocalTangentHandoffGeometry {
        position: endpoint.position,
        tangent: endpoint.tangent,
        surface_normal: endpoint.support_direction.scale(-1.0),
    }
}

pub fn box_local_tangent_handoff_geometry(
    center: Vector2,
    half_extents: Vector2,
    rotation_radians: f64,
    endpoint: ArcTrackAnchorEndpoint,
) -> LocalTangentHandoffGeometry {
    let axis_x = Vector2::new(1.0, 0.0).rotated(rotation_radians);
    let axis_y = axis_x.perp();
    let top_center = center.add(axis_y.scale(-half_extents.y));
    let half_width_offset = axis_x.scale(half_extents.x);
    let surface_normal = axis_y.scale(-1.0);

    let (position, tangent) = match endpoint {
        ArcTrackAnchorEndpoint::Start => (top_center.sub(half_width_offset), axis_x.scale(-1.0)),
        ArcTrackAnchorEndpoint::End => (top_center.add(half_width_offset), axis_x),
    };

    LocalTangentHandoffGeometry {
        position,
        tangent,
        surface_normal,
    }
}

pub fn angle_radians_for_position(relative: Vector2) -> Option<f64> {
    if relative.length() <= ARC_TRACK_EPSILON {
        None
    } else {
        Some(normalize_angle_radians((-relative.y).atan2(relative.x)))
    }
}

pub fn radial_for_angle(angle_radians: f64) -> Vector2 {
    Vector2::new(angle_radians.cos(), -angle_radians.sin())
}

pub fn support_direction(radial: Vector2, side: ArcTrackSide) -> Vector2 {
    match side {
        ArcTrackSide::Inside => radial.scale(-1.0),
        ArcTrackSide::Outside => radial,
    }
}

pub fn angle_is_within_arc(
    angle_radians: f64,
    start_angle_radians: f64,
    span_radians: f64,
) -> bool {
    ccw_span_radians(start_angle_radians, normalize_angle_radians(angle_radians))
        <= span_radians + ARC_TRACK_EPSILON
}

pub fn tangent_for_increasing_angle(radial: Vector2) -> Vector2 {
    radial.perp().scale(-1.0)
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
