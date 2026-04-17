use crate::arc_track::{
    ArcTrackAnchorEndpoint, ArcTrackAnchorEntityKind, ArcTrackCapturePolicy, CompiledArcTrack,
    box_local_tangent_handoff_geometry, compiled_arc_track_from_constraint, endpoint_geometry,
};
use crate::constraint::{ArcTrackEntryEndpoint, ArcTrackSide, CompiledConstraint};
use crate::entity::{CompiledEntity, CompiledShape, Vector2};

const GUIDE_NODE_POSITION_EPSILON: f64 = 1e-6;
const GUIDE_JUNCTION_POSITION_TOLERANCE: f64 = 1e-5;
const GUIDE_JUNCTION_TANGENT_ALIGNMENT: f64 = 0.999;

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledGuideNetwork {
    pub nodes: Vec<CompiledGuideNode>,
    pub segments: Vec<CompiledGuideSegment>,
    pub connections: Vec<CompiledGuideConnection>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledGuideNode {
    pub id: String,
    pub position: Vector2,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CompiledGuideSegment {
    Linear(LinearGuideSegment),
    Arc(ArcGuideSegment),
}

#[derive(Debug, Clone, PartialEq)]
pub struct LinearGuideSegment {
    pub id: String,
    pub source_entity_id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    pub start: Vector2,
    pub end: Vector2,
    pub direction: Vector2,
    pub length: f64,
    pub surface_normal: Vector2,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ArcGuideSegment {
    pub id: String,
    pub source_arc_track_id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    pub center: Vector2,
    pub radius: f64,
    pub start_angle_radians: f64,
    pub end_angle_radians: f64,
    pub span_radians: f64,
    pub side: ArcTrackSide,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuideSegmentEndpoint {
    Start,
    End,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledGuideConnection {
    pub from_segment_id: String,
    pub from_endpoint: GuideSegmentEndpoint,
    pub to_segment_id: String,
    pub to_endpoint: GuideSegmentEndpoint,
}

impl CompiledGuideNetwork {
    pub fn empty() -> Self {
        Self {
            nodes: Vec::new(),
            segments: Vec::new(),
            connections: Vec::new(),
        }
    }

    pub fn segment(&self, segment_id: &str) -> Option<&CompiledGuideSegment> {
        self.segments
            .iter()
            .find(|segment| segment.id() == segment_id)
    }

    pub fn successors_from(&self, segment_id: &str, endpoint: GuideSegmentEndpoint) -> Vec<String> {
        self.connections
            .iter()
            .filter(|connection| {
                connection.from_segment_id == segment_id && connection.from_endpoint == endpoint
            })
            .map(|connection| connection.to_segment_id.clone())
            .collect()
    }

    pub fn connection_from(
        &self,
        segment_id: &str,
        endpoint: GuideSegmentEndpoint,
    ) -> Option<&CompiledGuideConnection> {
        self.connections.iter().find(|connection| {
            connection.from_segment_id == segment_id && connection.from_endpoint == endpoint
        })
    }
}

impl CompiledGuideSegment {
    pub fn id(&self) -> &str {
        match self {
            Self::Linear(segment) => &segment.id,
            Self::Arc(segment) => &segment.id,
        }
    }
}

pub fn compile_guide_network(
    entities: &[CompiledEntity],
    constraints: &[CompiledConstraint],
    arc_tracks: &[CompiledArcTrack],
) -> CompiledGuideNetwork {
    let mut network = CompiledGuideNetwork::empty();
    let mut all_arc_tracks = arc_tracks.to_vec();

    all_arc_tracks.extend(
        constraints
            .iter()
            .filter_map(compiled_arc_track_from_constraint),
    );

    for arc_track in &all_arc_tracks {
        add_arc_guide_segment(&mut network, arc_track);
    }

    for arc_track in &all_arc_tracks {
        let Some(anchor) = &arc_track.anchor else {
            continue;
        };
        if anchor.entity_kind != ArcTrackAnchorEntityKind::Board {
            continue;
        }
        let Some(anchor_entity) = entities.iter().find(|entity| entity.id == anchor.entity_id)
        else {
            continue;
        };
        let Some(board_segment_id) =
            add_linear_anchor_guide_segment(&mut network, anchor_entity, anchor.endpoint)
        else {
            continue;
        };
        let Some(anchor_geometry) = box_geometry_for_anchor(anchor_entity, anchor.endpoint) else {
            continue;
        };
        let Some(board_segment) = network.segment(&board_segment_id) else {
            continue;
        };
        let board_end_node_id = match board_segment {
            CompiledGuideSegment::Linear(linear) => linear.end_node_id.clone(),
            CompiledGuideSegment::Arc(_) => continue,
        };

        for entry_endpoint in capture_policy_endpoints(arc_track.capture_policy) {
            let arc_entry = endpoint_geometry(
                arc_track.center,
                arc_track.contact_path_radius(),
                arc_track.start_angle_radians,
                arc_track.end_angle_radians,
                arc_track.side,
                entry_endpoint,
            );

            let to_endpoint = match entry_endpoint {
                ArcTrackEntryEndpoint::Start => GuideSegmentEndpoint::Start,
                ArcTrackEntryEndpoint::End => GuideSegmentEndpoint::End,
            };

            align_arc_junction_to_node(
                &mut network,
                arc_guide_segment_id(&arc_track.id).as_str(),
                to_endpoint,
                &board_end_node_id,
            );

            let _geometry_matches_authoritative_anchor =
                anchor_geometry.position.sub(arc_entry.position).length()
                    <= GUIDE_JUNCTION_POSITION_TOLERANCE
                    && anchor_geometry.tangent.dot(arc_entry.tangent)
                        >= GUIDE_JUNCTION_TANGENT_ALIGNMENT;

            push_connection_once(
                &mut network,
                CompiledGuideConnection {
                    from_segment_id: board_segment_id.clone(),
                    from_endpoint: GuideSegmentEndpoint::End,
                    to_segment_id: arc_guide_segment_id(&arc_track.id),
                    to_endpoint,
                },
            );
            push_connection_once(
                &mut network,
                CompiledGuideConnection {
                    from_segment_id: arc_guide_segment_id(&arc_track.id),
                    from_endpoint: to_endpoint,
                    to_segment_id: board_segment_id.clone(),
                    to_endpoint: GuideSegmentEndpoint::End,
                },
            );
        }
    }

    network
}

fn align_arc_junction_to_node(
    network: &mut CompiledGuideNetwork,
    segment_id: &str,
    endpoint: GuideSegmentEndpoint,
    node_id: &str,
) {
    let Some(segment) = network
        .segments
        .iter_mut()
        .find(|segment| segment.id() == segment_id)
    else {
        return;
    };

    let CompiledGuideSegment::Arc(arc) = segment else {
        return;
    };

    match endpoint {
        GuideSegmentEndpoint::Start => arc.start_node_id = node_id.to_string(),
        GuideSegmentEndpoint::End => arc.end_node_id = node_id.to_string(),
    }
}

fn add_arc_guide_segment(network: &mut CompiledGuideNetwork, arc_track: &CompiledArcTrack) {
    let contact_path_radius = arc_track.contact_path_radius();
    let start = endpoint_geometry(
        arc_track.center,
        contact_path_radius,
        arc_track.start_angle_radians,
        arc_track.end_angle_radians,
        arc_track.side,
        ArcTrackEntryEndpoint::Start,
    );
    let end = endpoint_geometry(
        arc_track.center,
        contact_path_radius,
        arc_track.start_angle_radians,
        arc_track.end_angle_radians,
        arc_track.side,
        ArcTrackEntryEndpoint::End,
    );
    let start_node_id = ensure_node(network, start.position);
    let end_node_id = ensure_node(network, end.position);
    let id = arc_guide_segment_id(&arc_track.id);

    if network.segment(&id).is_some() {
        return;
    }

    network
        .segments
        .push(CompiledGuideSegment::Arc(ArcGuideSegment {
            id,
            source_arc_track_id: arc_track.id.clone(),
            start_node_id,
            end_node_id,
            center: arc_track.center,
            radius: contact_path_radius,
            start_angle_radians: arc_track.start_angle_radians,
            end_angle_radians: arc_track.end_angle_radians,
            span_radians: arc_track.span_radians,
            side: arc_track.side,
        }));
}

fn add_linear_anchor_guide_segment(
    network: &mut CompiledGuideNetwork,
    entity: &CompiledEntity,
    terminal_endpoint: ArcTrackAnchorEndpoint,
) -> Option<String> {
    let id = board_top_guide_segment_id(&entity.id);

    if network.segment(&id).is_some() {
        return Some(id);
    }

    let start_geometry = box_geometry_for_anchor(entity, ArcTrackAnchorEndpoint::Start)?;
    let end_geometry = box_geometry_for_anchor(entity, ArcTrackAnchorEndpoint::End)?;
    let (start, end, direction, surface_normal) = match terminal_endpoint {
        ArcTrackAnchorEndpoint::Start => (
            end_geometry.position,
            start_geometry.position,
            start_geometry.tangent,
            start_geometry.surface_normal,
        ),
        ArcTrackAnchorEndpoint::End => (
            start_geometry.position,
            end_geometry.position,
            end_geometry.tangent,
            end_geometry.surface_normal,
        ),
    };
    let length = end.sub(start).length();

    if length <= f64::EPSILON {
        return None;
    }

    let start_node_id = ensure_node(network, start);
    let end_node_id = ensure_node(network, end);

    network
        .segments
        .push(CompiledGuideSegment::Linear(LinearGuideSegment {
            id: id.clone(),
            source_entity_id: entity.id.clone(),
            start_node_id,
            end_node_id,
            start,
            end,
            direction: direction.normalized(),
            length,
            surface_normal: surface_normal.normalized(),
        }));

    Some(id)
}

fn ensure_node(network: &mut CompiledGuideNetwork, position: Vector2) -> String {
    let id = node_id_for_position(position);

    if network.nodes.iter().all(|node| node.id != id) {
        network.nodes.push(CompiledGuideNode {
            id: id.clone(),
            position,
        });
    }

    id
}

fn push_connection_once(network: &mut CompiledGuideNetwork, connection: CompiledGuideConnection) {
    if !network
        .connections
        .iter()
        .any(|existing| existing == &connection)
    {
        network.connections.push(connection);
    }
}

fn box_geometry_for_anchor(
    entity: &CompiledEntity,
    endpoint: ArcTrackAnchorEndpoint,
) -> Option<crate::arc_track::LocalTangentHandoffGeometry> {
    let CompiledShape::Block { width, height } = &entity.shape else {
        return None;
    };

    Some(box_local_tangent_handoff_geometry(
        entity.position,
        Vector2::new(*width * 0.5, *height * 0.5),
        entity.rotation_radians,
        endpoint,
    ))
}

fn capture_policy_endpoints(policy: ArcTrackCapturePolicy) -> Vec<ArcTrackEntryEndpoint> {
    match policy {
        ArcTrackCapturePolicy::Start => vec![ArcTrackEntryEndpoint::Start],
        ArcTrackCapturePolicy::End => vec![ArcTrackEntryEndpoint::End],
        ArcTrackCapturePolicy::Either => {
            vec![ArcTrackEntryEndpoint::Start, ArcTrackEntryEndpoint::End]
        }
    }
}

fn board_top_guide_segment_id(entity_id: &str) -> String {
    format!("guide:{entity_id}:top")
}

fn arc_guide_segment_id(arc_track_id: &str) -> String {
    format!("guide:{arc_track_id}:arc")
}

fn node_id_for_position(position: Vector2) -> String {
    let x = (position.x / GUIDE_NODE_POSITION_EPSILON).round() * GUIDE_NODE_POSITION_EPSILON;
    let y = (position.y / GUIDE_NODE_POSITION_EPSILON).round() * GUIDE_NODE_POSITION_EPSILON;

    format!("guide-node:{x:.6}:{y:.6}")
}
