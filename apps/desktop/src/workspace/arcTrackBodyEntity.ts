import { getBoardArcEndpoints } from "../state/boardArcPlacement";
import type { EditorEntityPhysics, EditorSceneEntity } from "../state/editorStore";
import {
  createArcOverlayGeometry,
  type ArcOverlayGeometry,
  type OverlayPoint,
} from "./constraintOverlayGeometry";
import {
  authoringLengthToScreenPixels,
  projectAuthoringPointToScreen,
  type Point2,
  type UnitViewport,
} from "./unitViewport";

export type ArcTrackBodyEntity = {
  center: Point2;
  centralAngleDegrees: number;
  id: string;
  kind: "arc-track";
  label: string;
  radius: number;
  rotationDegrees: number;
  thickness: number;
} & EditorEntityPhysics;

export type ArcTrackPreviewResolution = {
  contactWithEntityId?: string;
  entity: ArcTrackBodyEntity;
  status: "free" | "snap";
  tangentGuide?: {
    end: Point2;
    start: Point2;
  };
};

const DEFAULT_ARC_TRACK_RADIUS = 0.72;
const DEFAULT_ARC_TRACK_SPAN_DEGREES = 90;
const DEFAULT_ARC_TRACK_THICKNESS = 0.24;
const DEFAULT_ARC_TRACK_PHYSICS: EditorEntityPhysics = {
  friction: 0.42,
  locked: false,
  mass: 5,
  restitution: 1,
  velocityX: 0,
  velocityY: 0,
};
const DEFAULT_ARC_TRACK_SNAP_DISTANCE = 0.28;

function isPoint2(value: unknown): value is Point2 {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    typeof value.x === "number" &&
    "y" in value &&
    typeof value.y === "number"
  );
}

function normalizeAngleDegrees(angleDegrees: number): number {
  const normalized = angleDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function distanceBetweenPoints(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getVectorAngleDegrees(vector: Point2): number {
  return (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
}

export function isArcTrackEntity(value: unknown): value is ArcTrackBodyEntity {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "arc-track" &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "center" in value &&
    isPoint2(value.center) &&
    "radius" in value &&
    typeof value.radius === "number" &&
    "centralAngleDegrees" in value &&
    typeof value.centralAngleDegrees === "number" &&
    "rotationDegrees" in value &&
    typeof value.rotationDegrees === "number" &&
    "thickness" in value &&
    typeof value.thickness === "number" &&
    "locked" in value &&
    typeof value.locked === "boolean" &&
    "mass" in value &&
    typeof value.mass === "number" &&
    "friction" in value &&
    typeof value.friction === "number" &&
    "restitution" in value &&
    typeof value.restitution === "number" &&
    "velocityX" in value &&
    typeof value.velocityX === "number" &&
    "velocityY" in value &&
    typeof value.velocityY === "number"
  );
}

export function isArcTrackBodyKind(value: string): value is "arc-track" {
  return value === "arc-track";
}

export function createArcTrackTemplate(position: Point2): ArcTrackBodyEntity {
  return {
    ...DEFAULT_ARC_TRACK_PHYSICS,
    center: position,
    centralAngleDegrees: DEFAULT_ARC_TRACK_SPAN_DEGREES,
    id: "arc-track-preview",
    kind: "arc-track",
    label: "Arc Track",
    radius: DEFAULT_ARC_TRACK_RADIUS,
    rotationDegrees: 0,
    thickness: DEFAULT_ARC_TRACK_THICKNESS,
  };
}

export function getArcTrackAngleRange(entity: ArcTrackBodyEntity): {
  endAngleDegrees: number;
  startAngleDegrees: number;
} {
  const halfSpanDegrees = entity.centralAngleDegrees / 2;

  return {
    endAngleDegrees: entity.rotationDegrees + halfSpanDegrees,
    startAngleDegrees: entity.rotationDegrees - halfSpanDegrees,
  };
}

export function createArcTrackOverlay(entity: ArcTrackBodyEntity): ArcOverlayGeometry {
  const angles = getArcTrackAngleRange(entity);

  return createArcOverlayGeometry({
    center: entity.center,
    endAngleDegrees: angles.endAngleDegrees,
    radius: entity.radius,
    startAngleDegrees: angles.startAngleDegrees,
  });
}

export function projectArcTrackEntityToScreen(
  entity: ArcTrackBodyEntity,
  viewport: UnitViewport,
): ArcTrackBodyEntity {
  return {
    ...entity,
    center: projectAuthoringPointToScreen(entity.center, viewport),
    radius: authoringLengthToScreenPixels(entity.radius, viewport),
    thickness: authoringLengthToScreenPixels(entity.thickness, viewport),
  };
}

export function getArcTrackCenter(entity: ArcTrackBodyEntity): Point2 {
  return entity.center;
}

function projectRadiusVector(radius: number, angleDegrees: number): OverlayPoint {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: radius * Math.cos(angleRadians),
    y: -radius * Math.sin(angleRadians),
  };
}

export function resolveArcTrackBodyPreview(input: {
  entities: EditorSceneEntity[];
  maxSnapDistance?: number;
  position: Point2;
}): ArcTrackPreviewResolution {
  const previewEntity = createArcTrackTemplate(input.position);
  const maxSnapDistance = input.maxSnapDistance ?? DEFAULT_ARC_TRACK_SNAP_DISTANCE;
  let closestBoardEndpoint:
    | {
        boardId: string;
        distance: number;
        point: Point2;
        tangent: Point2;
      }
    | null = null;

  for (const entity of input.entities) {
    if (entity.kind !== "board") {
      continue;
    }

    const endpoints = getBoardArcEndpoints(entity);

    for (const endpoint of [endpoints.start, endpoints.end]) {
      const distance = distanceBetweenPoints(input.position, endpoint.point);

      if (distance > maxSnapDistance) {
        continue;
      }

      if (!closestBoardEndpoint || distance < closestBoardEndpoint.distance) {
        closestBoardEndpoint = {
          boardId: entity.id,
          distance,
          point: endpoint.point,
          tangent: endpoint.tangent,
        };
      }
    }
  }

  if (!closestBoardEndpoint) {
    return {
      entity: previewEntity,
      status: "free",
    };
  }

  const contactAngleDegrees = normalizeAngleDegrees(
    270 - getVectorAngleDegrees(closestBoardEndpoint.tangent),
  );
  const radiusVector = projectRadiusVector(previewEntity.radius, contactAngleDegrees);
  const snappedEntity: ArcTrackBodyEntity = {
    ...previewEntity,
    center: {
      x: closestBoardEndpoint.point.x - radiusVector.x,
      y: closestBoardEndpoint.point.y - radiusVector.y,
    },
    rotationDegrees: normalizeAngleDegrees(
      contactAngleDegrees + previewEntity.centralAngleDegrees / 2,
    ),
  };
  const tangentGuideLength = Math.max(
    previewEntity.radius * 0.45,
    previewEntity.thickness * 2.5,
  );

  return {
    contactWithEntityId: closestBoardEndpoint.boardId,
    entity: snappedEntity,
    status: "snap",
    tangentGuide: {
      end: {
        x: closestBoardEndpoint.point.x + closestBoardEndpoint.tangent.x * tangentGuideLength,
        y: closestBoardEndpoint.point.y + closestBoardEndpoint.tangent.y * tangentGuideLength,
      },
      start: closestBoardEndpoint.point,
    },
  };
}
