use std::collections::{HashMap, HashSet};

use crate::arc_track::{
    ARC_TRACK_EPSILON, radial_for_angle, support_direction, tangent_for_increasing_angle,
};
use crate::constraint::ArcTrackSide;
use crate::entity::Vector2;
use crate::guide_network::{
    ArcGuideSegment, CompiledGuideNetwork, CompiledGuideSegment, GuideSegmentEndpoint,
    LinearGuideSegment,
};
use crate::solver::{RuntimeBodyShape, RuntimeBodyState};

const LINEAR_GUIDE_ATTACH_NORMAL_TOLERANCE: f64 = 0.08;
const LINEAR_GUIDE_ATTACH_LONGITUDINAL_TOLERANCE: f64 = 0.08;
const LINEAR_GUIDE_MIN_TANGENTIAL_SPEED: f64 = 1e-4;
const GUIDE_TERMINAL_ZONE_MIN_LENGTH: f64 = 0.02;
const GUIDE_TERMINAL_ZONE_BODY_RADIUS_FACTOR: f64 = 0.25;
const GUIDE_HANDOFF_SPEED_EPSILON: f64 = 1e-6;
const GUIDE_HANDOFF_LOOP_LIMIT: usize = 8;

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeGuideAttachment {
    pub segment_id: String,
    pub progress: f64,
    pub speed: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeGuideState {
    Free,
    OnGuide {
        segment_id: String,
        progress: f64,
        speed: f64,
    },
}

impl RuntimeGuideState {
    pub fn from_attachment(attachment: Option<&RuntimeGuideAttachment>) -> Self {
        match attachment {
            Some(attachment) => Self::OnGuide {
                segment_id: attachment.segment_id.clone(),
                progress: attachment.progress,
                speed: attachment.speed,
            },
            None => Self::Free,
        }
    }
}

pub fn attached_body_ids(attachments: &HashMap<String, RuntimeGuideAttachment>) -> HashSet<String> {
    attachments.keys().cloned().collect()
}

pub fn attach_free_bodies_to_guides(
    bodies: &mut [RuntimeBodyState],
    guide_network: &CompiledGuideNetwork,
    attachments: &mut HashMap<String, RuntimeGuideAttachment>,
    reattach_blocked_until_frame_by_body_id: &HashMap<String, u64>,
    current_frame_number: u64,
) {
    if guide_network.segments.is_empty() {
        return;
    }

    for body in bodies.iter_mut() {
        if body.is_static
            || body.shape != RuntimeBodyShape::Ball
            || attachments.contains_key(&body.entity_id)
            || reattach_blocked_until_frame_by_body_id
                .get(&body.entity_id)
                .is_some_and(|blocked_until_frame| *blocked_until_frame >= current_frame_number)
        {
            continue;
        }

        if let Some((attachment, linear)) = find_linear_guide_attachment(body, guide_network) {
            sync_body_to_linear_guide(body, linear, attachment.progress, attachment.speed);
            attachments.insert(body.entity_id.clone(), attachment);
        }
    }
}

pub fn advance_guide_attachments(
    bodies: &mut [RuntimeBodyState],
    guide_network: &CompiledGuideNetwork,
    attachments: &mut HashMap<String, RuntimeGuideAttachment>,
    reattach_blocked_until_frame_by_body_id: &mut HashMap<String, u64>,
    current_frame_number: u64,
    delta_seconds: f64,
) {
    if guide_network.segments.is_empty() {
        attachments.clear();
        return;
    }

    let index_by_id = bodies
        .iter()
        .enumerate()
        .map(|(index, body)| (body.entity_id.clone(), index))
        .collect::<HashMap<_, _>>();
    let attached_ids = attachments.keys().cloned().collect::<Vec<_>>();

    for body_id in attached_ids {
        let Some(&body_index) = index_by_id.get(&body_id) else {
            attachments.remove(&body_id);
            continue;
        };
        let Some(mut attachment) = attachments.get(&body_id).cloned() else {
            continue;
        };
        let body = &mut bodies[body_index];

        if advance_single_attachment(body, guide_network, &mut attachment, delta_seconds) {
            attachments.insert(body_id, attachment);
        } else {
            reattach_blocked_until_frame_by_body_id
                .insert(body_id.clone(), current_frame_number.saturating_add(1));
            attachments.remove(&body_id);
        }
    }
}

fn find_linear_guide_attachment<'a>(
    body: &RuntimeBodyState,
    guide_network: &'a CompiledGuideNetwork,
) -> Option<(RuntimeGuideAttachment, &'a LinearGuideSegment)> {
    let radius = body.half_extents.x.max(body.half_extents.y);

    guide_network.segments.iter().find_map(|segment| {
        let CompiledGuideSegment::Linear(linear) = segment else {
            return None;
        };
        let offset = body.position.sub(linear.start);
        let progress = offset.dot(linear.direction);
        let normal_offset = offset.dot(linear.surface_normal);
        let tangential_speed = body.velocity.dot(linear.direction);

        if progress < -LINEAR_GUIDE_ATTACH_LONGITUDINAL_TOLERANCE
            || progress > linear.length + LINEAR_GUIDE_ATTACH_LONGITUDINAL_TOLERANCE
            || (normal_offset - radius).abs() > LINEAR_GUIDE_ATTACH_NORMAL_TOLERANCE
            || tangential_speed.abs() <= LINEAR_GUIDE_MIN_TANGENTIAL_SPEED
        {
            return None;
        }

        Some((
            RuntimeGuideAttachment {
                segment_id: linear.id.clone(),
                progress: progress.clamp(0.0, linear.length),
                speed: tangential_speed,
            },
            linear,
        ))
    })
}

fn advance_single_attachment(
    body: &mut RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    attachment: &mut RuntimeGuideAttachment,
    delta_seconds: f64,
) -> bool {
    let mut remaining_seconds = delta_seconds.max(0.0);

    for _ in 0..GUIDE_HANDOFF_LOOP_LIMIT {
        let Some(segment) = guide_network.segment(&attachment.segment_id).cloned() else {
            return false;
        };
        let outcome = match segment {
            CompiledGuideSegment::Linear(linear) => {
                advance_linear_guide(body, guide_network, attachment, &linear, remaining_seconds)
            }
            CompiledGuideSegment::Arc(arc) => {
                advance_arc_guide(body, guide_network, attachment, &arc, remaining_seconds)
            }
        };

        match outcome {
            GuideAdvanceOutcome::StayAttached => return true,
            GuideAdvanceOutcome::Detached => return false,
            GuideAdvanceOutcome::HandedOff { remaining } => {
                remaining_seconds = remaining;
                if remaining_seconds <= f64::EPSILON {
                    sync_body_to_current_guide(body, guide_network, attachment);
                    return true;
                }
            }
        }
    }

    false
}

fn advance_linear_guide(
    body: &mut RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    attachment: &mut RuntimeGuideAttachment,
    linear: &LinearGuideSegment,
    delta_seconds: f64,
) -> GuideAdvanceOutcome {
    let external_acceleration = body.acceleration;
    let tangential_acceleration = external_acceleration.dot(linear.direction);
    if let Some(next_attachment) =
        try_terminal_zone_handoff(body, guide_network, attachment, linear)
    {
        *attachment = next_attachment;
        sync_body_to_current_guide(body, guide_network, attachment);
        return GuideAdvanceOutcome::HandedOff {
            remaining: delta_seconds,
        };
    }
    let next_progress = attachment.progress
        + attachment.speed * delta_seconds
        + 0.5 * tangential_acceleration * delta_seconds * delta_seconds;
    let next_speed = attachment.speed + tangential_acceleration * delta_seconds;

    if (0.0..=linear.length).contains(&next_progress) {
        attachment.progress = next_progress;
        attachment.speed = next_speed;
        sync_body_to_linear_guide(body, linear, attachment.progress, attachment.speed);
        return GuideAdvanceOutcome::StayAttached;
    }

    let endpoint = if next_progress < 0.0 {
        GuideSegmentEndpoint::Start
    } else {
        GuideSegmentEndpoint::End
    };
    let boundary_progress = if endpoint == GuideSegmentEndpoint::Start {
        0.0
    } else {
        linear.length
    };
    let boundary_distance = boundary_progress - attachment.progress;
    let hit_seconds = solve_boundary_hit_seconds(
        attachment.speed,
        tangential_acceleration,
        boundary_distance,
        delta_seconds,
    );
    let release_speed = attachment.speed + tangential_acceleration * hit_seconds;
    let remaining_seconds = (delta_seconds - hit_seconds).max(0.0);

    attachment.progress = boundary_progress;
    attachment.speed = release_speed;
    sync_body_to_linear_guide(body, linear, boundary_progress, release_speed);

    if let Some(next_attachment) = try_handoff(
        body,
        guide_network,
        linear.id.as_str(),
        endpoint,
        release_speed,
    ) {
        *attachment = next_attachment;
        sync_body_to_current_guide(body, guide_network, attachment);
        return GuideAdvanceOutcome::HandedOff {
            remaining: remaining_seconds,
        };
    }

    body.velocity = linear.direction.scale(release_speed);
    body.acceleration = external_acceleration;
    integrate_free_body(body, remaining_seconds);
    GuideAdvanceOutcome::Detached
}

fn try_terminal_zone_handoff(
    body: &RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    attachment: &RuntimeGuideAttachment,
    linear: &LinearGuideSegment,
) -> Option<RuntimeGuideAttachment> {
    let terminal_zone_length = linear_terminal_zone_length(body, linear);

    if attachment.speed > GUIDE_HANDOFF_SPEED_EPSILON
        && linear.length - attachment.progress <= terminal_zone_length
    {
        return try_handoff(
            body,
            guide_network,
            linear.id.as_str(),
            GuideSegmentEndpoint::End,
            attachment.speed,
        );
    }

    if attachment.speed < -GUIDE_HANDOFF_SPEED_EPSILON
        && attachment.progress <= terminal_zone_length
    {
        return try_handoff(
            body,
            guide_network,
            linear.id.as_str(),
            GuideSegmentEndpoint::Start,
            attachment.speed,
        );
    }

    None
}

fn advance_arc_guide(
    body: &mut RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    attachment: &mut RuntimeGuideAttachment,
    arc: &ArcGuideSegment,
    delta_seconds: f64,
) -> GuideAdvanceOutcome {
    let external_acceleration = body.acceleration;
    let angle = angle_for_arc_progress(arc, attachment.progress);
    let radial = radial_for_angle(angle);
    let tangent = tangent_for_increasing_angle(radial);
    let required_support = required_arc_support(
        external_acceleration,
        attachment.speed,
        radial,
        arc.radius,
        arc.side,
    );

    if required_support < -ARC_TRACK_EPSILON {
        body.position = arc.center.add(radial.scale(arc.radius));
        body.velocity = tangent.scale(attachment.speed);
        body.acceleration = external_acceleration;
        integrate_free_body(body, delta_seconds);
        return GuideAdvanceOutcome::Detached;
    }

    let tangential_acceleration = external_acceleration.dot(tangent);
    let next_progress = attachment.progress
        + attachment.speed * delta_seconds
        + 0.5 * tangential_acceleration * delta_seconds * delta_seconds;
    let arc_length = arc.radius * arc.span_radians;

    if next_progress < 0.0 || next_progress > arc_length {
        let endpoint = if next_progress < 0.0 {
            GuideSegmentEndpoint::Start
        } else {
            GuideSegmentEndpoint::End
        };
        let boundary_progress = if endpoint == GuideSegmentEndpoint::Start {
            0.0
        } else {
            arc_length
        };
        let boundary_distance = boundary_progress - attachment.progress;
        let hit_seconds = solve_boundary_hit_seconds(
            attachment.speed,
            tangential_acceleration,
            boundary_distance,
            delta_seconds,
        );
        let release_speed = attachment.speed + tangential_acceleration * hit_seconds;
        let remaining_seconds = (delta_seconds - hit_seconds).max(0.0);

        attachment.progress = boundary_progress;
        attachment.speed = release_speed;
        sync_body_to_arc_guide(body, arc, boundary_progress, release_speed);

        if let Some(next_attachment) = try_handoff(
            body,
            guide_network,
            arc.id.as_str(),
            endpoint,
            release_speed,
        ) {
            *attachment = next_attachment;
            sync_body_to_current_guide(body, guide_network, attachment);
            return GuideAdvanceOutcome::HandedOff {
                remaining: remaining_seconds,
            };
        }

        body.acceleration = external_acceleration;
        integrate_free_body(body, remaining_seconds);
        return GuideAdvanceOutcome::Detached;
    }

    let next_speed = attachment.speed + tangential_acceleration * delta_seconds;
    let next_angle = angle_for_arc_progress(arc, next_progress);
    let next_radial = radial_for_angle(next_angle);
    let next_required_support = required_arc_support(
        external_acceleration,
        next_speed,
        next_radial,
        arc.radius,
        arc.side,
    );

    if next_required_support < -ARC_TRACK_EPSILON {
        let release_fraction =
            (required_support / (required_support - next_required_support)).clamp(0.0, 1.0);
        let release_seconds = delta_seconds * release_fraction;
        let release_progress = attachment.progress
            + attachment.speed * release_seconds
            + 0.5 * tangential_acceleration * release_seconds * release_seconds;
        let release_speed = attachment.speed + tangential_acceleration * release_seconds;
        let remaining_seconds = (delta_seconds - release_seconds).max(0.0);

        sync_body_to_arc_guide(body, arc, release_progress, release_speed);
        body.acceleration = external_acceleration;
        integrate_free_body(body, remaining_seconds);
        return GuideAdvanceOutcome::Detached;
    }

    attachment.progress = next_progress;
    attachment.speed = next_speed;
    sync_body_to_arc_guide(body, arc, next_progress, next_speed);
    GuideAdvanceOutcome::StayAttached
}

fn try_handoff(
    body: &RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    from_segment_id: &str,
    from_endpoint: GuideSegmentEndpoint,
    release_speed: f64,
) -> Option<RuntimeGuideAttachment> {
    if !speed_exits_endpoint(release_speed, from_endpoint) {
        return None;
    }

    let release_velocity = body.velocity;
    let connection = guide_network.connection_from(from_segment_id, from_endpoint)?;
    let target = guide_network.segment(&connection.to_segment_id)?;

    match target {
        CompiledGuideSegment::Linear(linear) => {
            let progress = match connection.to_endpoint {
                GuideSegmentEndpoint::Start => 0.0,
                GuideSegmentEndpoint::End => linear.length,
            };
            let speed = release_velocity.dot(linear.direction);

            if !speed_enters_endpoint(speed, connection.to_endpoint) {
                return None;
            }

            Some(RuntimeGuideAttachment {
                segment_id: linear.id.clone(),
                progress,
                speed,
            })
        }
        CompiledGuideSegment::Arc(arc) => {
            let progress = match connection.to_endpoint {
                GuideSegmentEndpoint::Start => 0.0,
                GuideSegmentEndpoint::End => arc.radius * arc.span_radians,
            };
            let angle = angle_for_arc_progress(arc, progress);
            let speed = release_velocity.dot(tangent_for_increasing_angle(radial_for_angle(angle)));

            if !speed_enters_endpoint(speed, connection.to_endpoint) {
                return None;
            }

            Some(RuntimeGuideAttachment {
                segment_id: arc.id.clone(),
                progress,
                speed,
            })
        }
    }
}

fn speed_exits_endpoint(speed: f64, endpoint: GuideSegmentEndpoint) -> bool {
    match endpoint {
        GuideSegmentEndpoint::Start => speed < -GUIDE_HANDOFF_SPEED_EPSILON,
        GuideSegmentEndpoint::End => speed > GUIDE_HANDOFF_SPEED_EPSILON,
    }
}

fn speed_enters_endpoint(speed: f64, endpoint: GuideSegmentEndpoint) -> bool {
    match endpoint {
        GuideSegmentEndpoint::Start => speed > GUIDE_HANDOFF_SPEED_EPSILON,
        GuideSegmentEndpoint::End => speed < -GUIDE_HANDOFF_SPEED_EPSILON,
    }
}

fn sync_body_to_current_guide(
    body: &mut RuntimeBodyState,
    guide_network: &CompiledGuideNetwork,
    attachment: &RuntimeGuideAttachment,
) {
    let Some(segment) = guide_network.segment(&attachment.segment_id) else {
        return;
    };

    match segment {
        CompiledGuideSegment::Linear(linear) => {
            sync_body_to_linear_guide(body, linear, attachment.progress, attachment.speed);
        }
        CompiledGuideSegment::Arc(arc) => {
            sync_body_to_arc_guide(body, arc, attachment.progress, attachment.speed);
        }
    }
}

fn linear_terminal_zone_length(body: &RuntimeBodyState, linear: &LinearGuideSegment) -> f64 {
    let body_radius = body.half_extents.x.max(body.half_extents.y);

    (body_radius * GUIDE_TERMINAL_ZONE_BODY_RADIUS_FACTOR)
        .max(GUIDE_TERMINAL_ZONE_MIN_LENGTH)
        .min(linear.length)
}

fn sync_body_to_linear_guide(
    body: &mut RuntimeBodyState,
    linear: &LinearGuideSegment,
    progress: f64,
    speed: f64,
) {
    let radius = body.half_extents.x.max(body.half_extents.y);
    let tangential_acceleration = body.acceleration.dot(linear.direction);

    body.position = linear
        .start
        .add(linear.direction.scale(progress))
        .add(linear.surface_normal.scale(radius));
    body.velocity = linear.direction.scale(speed);
    body.acceleration = linear.direction.scale(tangential_acceleration);
    body.angular_velocity_radians = 0.0;
}

fn sync_body_to_arc_guide(
    body: &mut RuntimeBodyState,
    arc: &ArcGuideSegment,
    progress: f64,
    speed: f64,
) {
    let angle = angle_for_arc_progress(arc, progress);
    let radial = radial_for_angle(angle);
    let tangent = tangent_for_increasing_angle(radial);
    let tangential_acceleration = body.acceleration.dot(tangent);

    body.position = arc.center.add(radial.scale(arc.radius));
    body.velocity = tangent.scale(speed);
    body.acceleration = tangent
        .scale(tangential_acceleration)
        .sub(radial.scale((speed * speed) / arc.radius));
    body.angular_velocity_radians = 0.0;
}

fn required_arc_support(
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
        .dot(support_direction(radial, side))
}

fn angle_for_arc_progress(arc: &ArcGuideSegment, progress: f64) -> f64 {
    normalize_angle_radians(arc.start_angle_radians + progress / arc.radius)
}

fn solve_boundary_hit_seconds(
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

fn integrate_free_body(body: &mut RuntimeBodyState, delta_seconds: f64) {
    if delta_seconds <= f64::EPSILON {
        return;
    }

    body.position = body
        .position
        .add(body.velocity.scale(delta_seconds))
        .add(body.acceleration.scale(0.5 * delta_seconds * delta_seconds));
    body.velocity = body.velocity.add(body.acceleration.scale(delta_seconds));
}

fn normalize_angle_radians(angle_radians: f64) -> f64 {
    let mut normalized = angle_radians % (std::f64::consts::PI * 2.0);

    if normalized < 0.0 {
        normalized += std::f64::consts::PI * 2.0;
    }

    normalized
}

enum GuideAdvanceOutcome {
    StayAttached,
    HandedOff { remaining: f64 },
    Detached,
}
