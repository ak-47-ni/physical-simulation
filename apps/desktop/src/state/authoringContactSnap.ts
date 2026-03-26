import type { EditorSceneEntity } from "./editorStore";
import { canPlaceAuthoringEntity } from "./authoringOccupancy";
import { convertLengthValue, type LengthUnit } from "./sceneUnits";

const GEOMETRY_EPSILON = 1e-9;
const SNAP_EPSILON = 1e-6;
const DEFAULT_SNAP_DISTANCE_METERS = 0.12;

type Vector2 = {
  x: number;
  y: number;
};

type CircleFootprint = {
  center: Vector2;
  kind: "circle";
  radius: number;
};

type RectangleFootprint = {
  axisX: Vector2;
  axisY: Vector2;
  center: Vector2;
  halfHeight: number;
  halfWidth: number;
  kind: "rectangle";
  relativeCorners: [Vector2, Vector2, Vector2, Vector2];
};

type AuthoringFootprint = CircleFootprint | RectangleFootprint;

type PlacementSuggestion = {
  contactNormal: Vector2;
  contactWithEntityId: string;
  distance: number;
  entity: EditorSceneEntity;
};

export type AuthoringPlacementResolution =
  | { status: "free"; entity: EditorSceneEntity }
  | {
      status: "snap";
      entity: EditorSceneEntity;
      contactWithEntityId: string;
      contactNormal: Vector2;
    }
  | { status: "blocked"; entity: null };

export type AuthoringPlacementPreview =
  | {
      entity: EditorSceneEntity;
      status: "free" | "snap" | "blocked";
      contactWithEntityId?: string;
    }
  | null;

export function getDefaultAuthoringSnapDistance(lengthUnit: LengthUnit): number {
  return convertLengthValue(DEFAULT_SNAP_DISTANCE_METERS, "m", lengthUnit);
}

export function resolveAuthoringPlacement(input: {
  candidate: EditorSceneEntity;
  entities: EditorSceneEntity[];
  ignoreEntityId?: string;
  maxSnapDistance: number;
}): AuthoringPlacementResolution {
  const { candidate, entities, ignoreEntityId, maxSnapDistance } = input;
  const placementIsAlreadyLegal = canPlaceAuthoringEntity({
    candidate,
    entities,
    ignoreEntityId,
  });
  const suggestions = entities
    .filter((entity) => entity.id !== ignoreEntityId)
    .map((entity) => createPlacementSuggestion(candidate, entity))
    .filter((suggestion): suggestion is PlacementSuggestion => suggestion !== null)
    .filter((suggestion) => suggestion.distance > SNAP_EPSILON)
    .filter((suggestion) => suggestion.distance <= maxSnapDistance + SNAP_EPSILON)
    .filter((suggestion) =>
      canPlaceAuthoringEntity({
        candidate: suggestion.entity,
        entities,
        ignoreEntityId,
      }),
    )
    .sort((a, b) => {
      if (Math.abs(a.distance - b.distance) > SNAP_EPSILON) {
        return a.distance - b.distance;
      }

      return a.contactWithEntityId.localeCompare(b.contactWithEntityId);
    });

  const bestSuggestion = suggestions[0];

  if (bestSuggestion) {
    return {
      status: "snap",
      entity: bestSuggestion.entity,
      contactWithEntityId: bestSuggestion.contactWithEntityId,
      contactNormal: bestSuggestion.contactNormal,
    };
  }

  if (placementIsAlreadyLegal) {
    return {
      status: "free",
      entity: candidate,
    };
  }

  return {
    status: "blocked",
    entity: null,
  };
}

function createPlacementSuggestion(
  candidate: EditorSceneEntity,
  obstacle: EditorSceneEntity,
): PlacementSuggestion | null {
  const candidateFootprint = createFootprint(candidate);
  const obstacleFootprint = createFootprint(obstacle);
  const snappedCenter = findSnappedCenter(candidateFootprint, obstacleFootprint);

  if (!snappedCenter) {
    return null;
  }

  const currentCenter = candidateFootprint.center;
  const translation = subtract(snappedCenter, currentCenter);
  const distance = length(translation);

  if (distance <= SNAP_EPSILON) {
    return null;
  }

  return {
    contactNormal: normalizeOrFallback(translation, { x: 0, y: 1 }),
    contactWithEntityId: obstacle.id,
    distance,
    entity: createEntityWithCenter(candidate, snappedCenter),
  };
}

function findSnappedCenter(
  candidate: AuthoringFootprint,
  obstacle: AuthoringFootprint,
): Vector2 | null {
  if (candidate.kind === "circle" && obstacle.kind === "circle") {
    return snapCircleCenterToCircle(candidate, obstacle);
  }

  if (candidate.kind === "circle" && obstacle.kind === "rectangle") {
    return snapCircleCenterToRectangle(candidate, obstacle);
  }

  if (candidate.kind === "rectangle" && obstacle.kind === "circle") {
    return snapRectangleCenterToCircle(candidate, obstacle);
  }

  if (candidate.kind === "rectangle" && obstacle.kind === "rectangle") {
    return snapRectangleCenterToRectangle(candidate, obstacle);
  }

  return null;
}

function snapCircleCenterToCircle(
  candidate: CircleFootprint,
  obstacle: CircleFootprint,
): Vector2 {
  const relativeCenter = subtract(candidate.center, obstacle.center);
  const direction = normalizeOrFallback(relativeCenter, { x: 1, y: 0 });

  return addVectors(obstacle.center, scale(direction, candidate.radius + obstacle.radius));
}

function snapCircleCenterToRectangle(
  candidate: CircleFootprint,
  obstacle: RectangleFootprint,
): Vector2 {
  const localCenter = worldToLocal(candidate.center, obstacle.center, obstacle.axisX, obstacle.axisY);
  const boundary = projectPointToRoundedRectangleBoundary(
    localCenter,
    obstacle.halfWidth,
    obstacle.halfHeight,
    candidate.radius,
  );

  return localToWorld(boundary, obstacle.center, obstacle.axisX, obstacle.axisY);
}

function snapRectangleCenterToCircle(
  candidate: RectangleFootprint,
  obstacle: CircleFootprint,
): Vector2 {
  const localCenter = worldToLocal(candidate.center, obstacle.center, candidate.axisX, candidate.axisY);
  const boundary = projectPointToRoundedRectangleBoundary(
    localCenter,
    candidate.halfWidth,
    candidate.halfHeight,
    obstacle.radius,
  );

  return localToWorld(boundary, obstacle.center, candidate.axisX, candidate.axisY);
}

function snapRectangleCenterToRectangle(
  candidate: RectangleFootprint,
  obstacle: RectangleFootprint,
): Vector2 | null {
  const obstaclePolygon = createRectanglePairContactPolygon(candidate, obstacle);

  if (obstaclePolygon.length < 2) {
    return null;
  }

  const relativeCenter = subtract(candidate.center, obstacle.center);
  const snappedRelativeCenter = projectPointToPolygonBoundary(relativeCenter, obstaclePolygon);

  return addVectors(obstacle.center, snappedRelativeCenter);
}

function createRectanglePairContactPolygon(
  candidate: RectangleFootprint,
  obstacle: RectangleFootprint,
): Vector2[] {
  const points: Vector2[] = [];

  for (const obstacleCorner of obstacle.relativeCorners) {
    for (const candidateCorner of candidate.relativeCorners) {
      points.push(addVectors(obstacleCorner, candidateCorner));
    }
  }

  return computeConvexHull(points);
}

function computeConvexHull(points: Vector2[]): Vector2[] {
  const uniquePoints = dedupePoints(points).sort((a, b) =>
    Math.abs(a.x - b.x) > GEOMETRY_EPSILON ? a.x - b.x : a.y - b.y,
  );

  if (uniquePoints.length <= 1) {
    return uniquePoints;
  }

  const lower: Vector2[] = [];

  for (const point of uniquePoints) {
    while (
      lower.length >= 2 &&
      cross(
        subtract(lower[lower.length - 1], lower[lower.length - 2]),
        subtract(point, lower[lower.length - 1]),
      ) <= GEOMETRY_EPSILON
    ) {
      lower.pop();
    }

    lower.push(point);
  }

  const upper: Vector2[] = [];

  for (let index = uniquePoints.length - 1; index >= 0; index -= 1) {
    const point = uniquePoints[index];

    while (
      upper.length >= 2 &&
      cross(
        subtract(upper[upper.length - 1], upper[upper.length - 2]),
        subtract(point, upper[upper.length - 1]),
      ) <= GEOMETRY_EPSILON
    ) {
      upper.pop();
    }

    upper.push(point);
  }

  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

function dedupePoints(points: Vector2[]): Vector2[] {
  const unique: Vector2[] = [];

  for (const point of points) {
    if (
      unique.some(
        (candidate) =>
          Math.abs(candidate.x - point.x) <= GEOMETRY_EPSILON &&
          Math.abs(candidate.y - point.y) <= GEOMETRY_EPSILON,
      )
    ) {
      continue;
    }

    unique.push(point);
  }

  return unique;
}

function projectPointToPolygonBoundary(point: Vector2, polygon: Vector2[]): Vector2 {
  let nearestPoint = polygon[0];
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const projected = projectPointToSegment(point, start, end);
    const distanceSquared = squaredLength(subtract(point, projected));

    if (distanceSquared < nearestDistanceSquared - GEOMETRY_EPSILON) {
      nearestPoint = projected;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestPoint;
}

function projectPointToRoundedRectangleBoundary(
  point: Vector2,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): Vector2 {
  const candidates: Vector2[] = [
    {
      x: clamp(point.x, -halfWidth, halfWidth),
      y: -(halfHeight + radius),
    },
    {
      x: clamp(point.x, -halfWidth, halfWidth),
      y: halfHeight + radius,
    },
    {
      x: -(halfWidth + radius),
      y: clamp(point.y, -halfHeight, halfHeight),
    },
    {
      x: halfWidth + radius,
      y: clamp(point.y, -halfHeight, halfHeight),
    },
  ];
  const corners: Array<{ center: Vector2; signX: number; signY: number }> = [
    { center: { x: halfWidth, y: halfHeight }, signX: 1, signY: 1 },
    { center: { x: halfWidth, y: -halfHeight }, signX: 1, signY: -1 },
    { center: { x: -halfWidth, y: halfHeight }, signX: -1, signY: 1 },
    { center: { x: -halfWidth, y: -halfHeight }, signX: -1, signY: -1 },
  ];

  for (const corner of corners) {
    const offset = subtract(point, corner.center);
    const quadrantOffset = {
      x: Math.max(0, offset.x * corner.signX) * corner.signX,
      y: Math.max(0, offset.y * corner.signY) * corner.signY,
    };

    if (length(quadrantOffset) <= GEOMETRY_EPSILON) {
      continue;
    }

    const direction = normalizeOrFallback(quadrantOffset, {
      x: corner.signX,
      y: corner.signY,
    });

    candidates.push(addVectors(corner.center, scale(direction, radius)));
  }

  let nearestPoint = candidates[0];
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distanceSquared = squaredLength(subtract(point, candidate));

    if (distanceSquared < nearestDistanceSquared - GEOMETRY_EPSILON) {
      nearestPoint = candidate;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearestPoint;
}

function projectPointToSegment(point: Vector2, start: Vector2, end: Vector2): Vector2 {
  const edge = subtract(end, start);
  const edgeLengthSquared = squaredLength(edge);

  if (edgeLengthSquared <= GEOMETRY_EPSILON) {
    return start;
  }

  const t = clamp(dot(subtract(point, start), edge) / edgeLengthSquared, 0, 1);

  return addVectors(start, scale(edge, t));
}

function createEntityWithCenter(entity: EditorSceneEntity, center: Vector2): EditorSceneEntity {
  if (entity.kind === "ball") {
    return {
      ...entity,
      x: center.x - entity.radius,
      y: center.y - entity.radius,
    };
  }

  return {
    ...entity,
    x: center.x - entity.width / 2,
    y: center.y - entity.height / 2,
  };
}

function createFootprint(entity: EditorSceneEntity): AuthoringFootprint {
  if (entity.kind === "ball") {
    return {
      kind: "circle",
      center: {
        x: entity.x + entity.radius,
        y: entity.y + entity.radius,
      },
      radius: entity.radius,
    };
  }

  const center = {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
  const halfWidth = entity.width / 2;
  const halfHeight = entity.height / 2;
  const rotationRadians = ((entity.rotationDegrees ?? 0) * Math.PI) / 180;
  const axisX = {
    x: Math.cos(rotationRadians),
    y: Math.sin(rotationRadians),
  };
  const axisY = {
    x: -Math.sin(rotationRadians),
    y: Math.cos(rotationRadians),
  };
  const relativeCorners: RectangleFootprint["relativeCorners"] = [
    scaleAndAdd(scale(axisX, -halfWidth), axisY, -halfHeight),
    scaleAndAdd(scale(axisX, halfWidth), axisY, -halfHeight),
    scaleAndAdd(scale(axisX, halfWidth), axisY, halfHeight),
    scaleAndAdd(scale(axisX, -halfWidth), axisY, halfHeight),
  ];

  return {
    kind: "rectangle",
    center,
    axisX,
    axisY,
    halfWidth,
    halfHeight,
    relativeCorners,
  };
}

function worldToLocal(
  point: Vector2,
  origin: Vector2,
  axisX: Vector2,
  axisY: Vector2,
): Vector2 {
  const relative = subtract(point, origin);

  return {
    x: dot(relative, axisX),
    y: dot(relative, axisY),
  };
}

function localToWorld(
  point: Vector2,
  origin: Vector2,
  axisX: Vector2,
  axisY: Vector2,
): Vector2 {
  return addVectors(origin, scaleAndAdd(scale(axisX, point.x), axisY, point.y));
}

function normalizeOrFallback(vector: Vector2, fallback: Vector2): Vector2 {
  const vectorLength = length(vector);

  if (vectorLength <= GEOMETRY_EPSILON) {
    return normalize(fallback);
  }

  return {
    x: vector.x / vectorLength,
    y: vector.y / vectorLength,
  };
}

function normalize(vector: Vector2): Vector2 {
  const vectorLength = length(vector);

  if (vectorLength <= GEOMETRY_EPSILON) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / vectorLength,
    y: vector.y / vectorLength,
  };
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function addVectors(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function scale(vector: Vector2, factor: number): Vector2 {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
  };
}

function scaleAndAdd(base: Vector2, direction: Vector2, factor: number): Vector2 {
  return {
    x: base.x + direction.x * factor,
    y: base.y + direction.y * factor,
  };
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function length(vector: Vector2): number {
  return Math.hypot(vector.x, vector.y);
}

function squaredLength(vector: Vector2): number {
  return dot(vector, vector);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
