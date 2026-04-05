import { resolveBoardArcSnapTarget } from "../state/boardArcPlacement";
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

export type ArcTrackGeometryEntity = Extract<EditorSceneEntity, { kind: "arc-track" }>;
export type ArcTrackBodyEntity = ArcTrackGeometryEntity & Partial<EditorEntityPhysics>;
export type ArcTrackPreviewEntity = ArcTrackGeometryEntity & EditorEntityPhysics;

export type ArcTrackPreviewResolution = {
  contactWithEntityId?: string;
  entity: ArcTrackPreviewEntity;
  status: "free" | "snap";
  tangentGuide?: {
    end: Point2;
    start: Point2;
  };
};

const DEFAULT_ARC_TRACK_RADIUS = 0.72;
const DEFAULT_ARC_TRACK_SPAN_DEGREES = 90;
export const DEFAULT_ARC_TRACK_THICKNESS = 0.18;
const DEFAULT_ARC_TRACK_PHYSICS: EditorEntityPhysics = {
  friction: 0.42,
  locked: false,
  mass: 5,
  restitution: 1,
  velocityX: 0,
  velocityY: 0,
};
const DEFAULT_ARC_TRACK_SNAP_DISTANCE = 0.28;
const ARC_TRACK_PROFILE_PADDING = 6;
const ARC_TRACK_PROFILE_OUTLINE_WIDTH = 2;

export type ArcTrackProfileGeometry = {
  bounds: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  center: OverlayPoint;
  innerEndPoint: OverlayPoint;
  innerStartPoint: OverlayPoint;
  outerEndPoint: OverlayPoint;
  outerStartPoint: OverlayPoint;
  outlineWidth: number;
  pathData: string;
};

type ArcTrackProfileGeometryInput = {
  center: Point2;
  endAngleDegrees: number;
  radius: number;
  startAngleDegrees: number;
  thickness: number;
};

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

function roundOverlayValue(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeArcSweepDegrees(startAngleDegrees: number, endAngleDegrees: number): number {
  let sweep = endAngleDegrees - startAngleDegrees;

  while (sweep <= 0) {
    sweep += 360;
  }

  return sweep;
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
    typeof value.thickness === "number"
  );
}

export function isArcTrackBodyKind(value: string): value is "arc-track" {
  return value === "arc-track";
}

export function createArcTrackTemplate(position: Point2): ArcTrackPreviewEntity {
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

function projectArcPoint(center: Point2, radius: number, angleDegrees: number): OverlayPoint {
  const radiusVector = projectRadiusVector(radius, angleDegrees);

  return {
    x: roundOverlayValue(center.x + radiusVector.x),
    y: roundOverlayValue(center.y + radiusVector.y),
  };
}

function sampleArcPoints(input: ArcTrackProfileGeometryInput & { radius: number }): OverlayPoint[] {
  const sweepDegrees = normalizeArcSweepDegrees(input.startAngleDegrees, input.endAngleDegrees);
  const segmentCount = Math.max(10, Math.ceil(sweepDegrees / 10));
  const points: OverlayPoint[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const angleDegrees = input.startAngleDegrees + (sweepDegrees * index) / segmentCount;

    points.push(projectArcPoint(input.center, input.radius, angleDegrees));
  }

  return points;
}

function createTranslatedPathSegment(
  points: OverlayPoint[],
  bounds: ArcTrackProfileGeometry["bounds"],
  command: "M" | "L",
): string[] {
  return points.map((point, index) => {
    const translatedX = roundOverlayValue(point.x - bounds.left);
    const translatedY = roundOverlayValue(point.y - bounds.top);

    return `${index === 0 ? command : "L"} ${translatedX} ${translatedY}`;
  });
}

export function createArcTrackProfileGeometryFromAngles(
  input: ArcTrackProfileGeometryInput,
): ArcTrackProfileGeometry {
  const outerRadius = Math.max(input.radius + input.thickness / 2, 0);
  const innerRadius = Math.max(input.radius - input.thickness / 2, 0);
  const outerPoints = sampleArcPoints({
    ...input,
    radius: outerRadius,
  });
  const innerPoints = sampleArcPoints({
    ...input,
    radius: innerRadius,
  });
  const allPoints = [...outerPoints, ...innerPoints];
  const left = roundOverlayValue(Math.min(...allPoints.map((point) => point.x)) - ARC_TRACK_PROFILE_PADDING);
  const top = roundOverlayValue(Math.min(...allPoints.map((point) => point.y)) - ARC_TRACK_PROFILE_PADDING);
  const right = roundOverlayValue(
    Math.max(...allPoints.map((point) => point.x)) + ARC_TRACK_PROFILE_PADDING,
  );
  const bottom = roundOverlayValue(
    Math.max(...allPoints.map((point) => point.y)) + ARC_TRACK_PROFILE_PADDING,
  );
  const bounds = {
    height: roundOverlayValue(bottom - top),
    left,
    top,
    width: roundOverlayValue(right - left),
  };
  const pathData = [
    ...createTranslatedPathSegment(outerPoints, bounds, "M"),
    ...createTranslatedPathSegment([...innerPoints].reverse(), bounds, "L"),
    "Z",
  ].join(" ");
  const startAngleDegrees = input.startAngleDegrees;
  const endAngleDegrees = input.endAngleDegrees;

  return {
    bounds,
    center: projectArcPoint(input.center, 0, 0),
    innerEndPoint: projectArcPoint(input.center, innerRadius, endAngleDegrees),
    innerStartPoint: projectArcPoint(input.center, innerRadius, startAngleDegrees),
    outerEndPoint: projectArcPoint(input.center, outerRadius, endAngleDegrees),
    outerStartPoint: projectArcPoint(input.center, outerRadius, startAngleDegrees),
    outlineWidth: ARC_TRACK_PROFILE_OUTLINE_WIDTH,
    pathData,
  };
}

export function createArcTrackProfileGeometry(
  entity: ArcTrackBodyEntity,
): ArcTrackProfileGeometry {
  const angles = getArcTrackAngleRange(entity);

  return createArcTrackProfileGeometryFromAngles({
    center: entity.center,
    endAngleDegrees: angles.endAngleDegrees,
    radius: entity.radius,
    startAngleDegrees: angles.startAngleDegrees,
    thickness: entity.thickness,
  });
}

export function resolveArcTrackBodyPreview(input: {
  entities: EditorSceneEntity[];
  maxSnapDistance?: number;
  position: Point2;
}): ArcTrackPreviewResolution {
  const previewEntity = createArcTrackTemplate(input.position);
  const maxSnapDistance = input.maxSnapDistance ?? DEFAULT_ARC_TRACK_SNAP_DISTANCE;
  const closestBoardEndpoint = resolveBoardArcSnapTarget({
    boards: input.entities.filter(
      (entity): entity is Extract<EditorSceneEntity, { kind: "board" }> => entity.kind === "board",
    ),
    maxSnapDistance,
    position: input.position,
  });

  if (!closestBoardEndpoint) {
    return {
      entity: previewEntity,
      status: "free",
    };
  }

  const contactAngleDegrees = normalizeAngleDegrees(
    270 - getVectorAngleDegrees(closestBoardEndpoint.endpoint.tangent),
  );
  const radiusVector = projectRadiusVector(previewEntity.radius, contactAngleDegrees);
  const snappedEntity: ArcTrackBodyEntity = {
    ...previewEntity,
    center: {
      x: closestBoardEndpoint.endpoint.point.x - radiusVector.x,
      y: closestBoardEndpoint.endpoint.point.y - radiusVector.y,
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
        x:
          closestBoardEndpoint.endpoint.point.x +
          closestBoardEndpoint.endpoint.tangent.x * tangentGuideLength,
        y:
          closestBoardEndpoint.endpoint.point.y +
          closestBoardEndpoint.endpoint.tangent.y * tangentGuideLength,
      },
      start: closestBoardEndpoint.endpoint.point,
    },
  };
}
