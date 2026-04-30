import type { EditorSceneEntity } from "./editorStore";
import { canPlaceAuthoringEntity } from "./authoringOccupancy";
import { convertLengthValue, type LengthUnit } from "./sceneUnits";

const GEOMETRY_EPSILON = 1e-9;
const SNAP_EPSILON = 1e-6;
const DEFAULT_SNAP_DISTANCE_METERS = 0.12;
const ALIGNMENT_LINE_EXTENSION_RATIO = 1 / 3;
const EDGE_ALIGNMENT_PERPENDICULAR_REACH_MULTIPLIER = 2;

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
  placementGuides?: AuthoringPlacementGuide[];
  priority: number;
};

export type AuthoringPlacementGuideLine = {
  start: Vector2;
  end: Vector2;
};

export type AuthoringPlacementDistanceSegment = {
  distance: number;
  start: Vector2;
  end: Vector2;
};

export type AuthoringPlacementGuide = {
  alignmentLines: AuthoringPlacementGuideLine[];
  distanceSegments: AuthoringPlacementDistanceSegment[];
  targetEntityId: string;
};

export type AuthoringPlacementResolution =
  | { status: "free"; entity: EditorSceneEntity }
  | {
      status: "snap";
      entity: EditorSceneEntity;
      contactWithEntityId: string;
      contactNormal: Vector2;
      placementGuides?: AuthoringPlacementGuide[];
    }
  | { status: "blocked"; entity: null };

export type AuthoringPlacementPreview =
  | {
      entity: EditorSceneEntity;
      status: "free" | "snap" | "blocked";
      contactWithEntityId?: string;
      placementGuides?: AuthoringPlacementGuide[];
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
    .flatMap((entity) => createPlacementSuggestions(candidate, entity, maxSnapDistance))
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
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

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
      placementGuides: bestSuggestion.placementGuides,
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

function createPlacementSuggestions(
  candidate: EditorSceneEntity,
  obstacle: EditorSceneEntity,
  maxSnapDistance: number,
): PlacementSuggestion[] {
  if (candidate.kind === "arc-track" || obstacle.kind === "arc-track") {
    return [];
  }

  const candidateFootprint = createFootprint(candidate);
  const obstacleFootprint = createFootprint(obstacle);
  const snappedCenter = findSnappedCenter(candidateFootprint, obstacleFootprint);
  const suggestions: PlacementSuggestion[] = [];

  if (snappedCenter) {
    const contactEntity = createEntityWithCenter(candidate, snappedCenter);
    const alignment = isRectangleCornerContact(createFootprint(contactEntity), obstacleFootprint)
      ? {
          alignmentLines: [],
          entity: contactEntity,
          translation: { x: 0, y: 0 },
        }
      : applyNearbyEdgeAlignment(contactEntity, obstacle, maxSnapDistance);
    suggestions.push(
      createSuggestionFromEntity({
        alignmentLines: alignment.alignmentLines,
        candidate,
        contactNormalFallback: { x: 0, y: 1 },
        contactWithEntityId: obstacle.id,
        entity: alignment.entity,
        obstacle,
        priority: 0,
      }),
    );
  }

  const alignment = applyNearbyEdgeAlignment(candidate, obstacle, maxSnapDistance);

  if (alignment.alignmentLines.length > 0) {
    suggestions.push(
      createSuggestionFromEntity({
        alignmentLines: alignment.alignmentLines,
        candidate,
        contactNormalFallback: alignment.translation,
        contactWithEntityId: obstacle.id,
        entity: alignment.entity,
        obstacle,
        priority: 1,
      }),
    );
  }

  return suggestions;
}

function isRectangleCornerContact(
  candidate: AuthoringFootprint,
  obstacle: AuthoringFootprint,
): boolean {
  if (obstacle.kind !== "rectangle") {
    return false;
  }

  const localCenter = worldToLocal(candidate.center, obstacle.center, obstacle.axisX, obstacle.axisY);

  return (
    Math.abs(localCenter.x) > obstacle.halfWidth + SNAP_EPSILON &&
    Math.abs(localCenter.y) > obstacle.halfHeight + SNAP_EPSILON
  );
}

function createSuggestionFromEntity(input: {
  alignmentLines: AuthoringPlacementGuideLine[];
  candidate: EditorSceneEntity;
  contactNormalFallback: Vector2;
  contactWithEntityId: string;
  entity: EditorSceneEntity;
  obstacle: EditorSceneEntity;
  priority: number;
}): PlacementSuggestion {
  const currentCenter = createFootprint(input.candidate).center;
  const snappedCenter = createFootprint(input.entity).center;
  const translation = subtract(snappedCenter, currentCenter);
  const placementGuides = createPlacementGuides(input.entity, input.obstacle, input.alignmentLines);

  return {
    contactNormal: normalizeOrFallback(
      length(translation) > SNAP_EPSILON ? translation : input.contactNormalFallback,
      { x: 0, y: 1 },
    ),
    contactWithEntityId: input.contactWithEntityId,
    distance: length(translation),
    entity: input.entity,
    placementGuides,
    priority: input.priority,
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

function applyNearbyEdgeAlignment(
  candidate: EditorSceneEntity,
  obstacle: EditorSceneEntity,
  maxSnapDistance: number,
): {
  alignmentLines: AuthoringPlacementGuideLine[];
  entity: EditorSceneEntity;
  translation: Vector2;
} {
  if (candidate.kind === "arc-track" || obstacle.kind === "arc-track") {
    return {
      alignmentLines: [],
      entity: candidate,
      translation: { x: 0, y: 0 },
    };
  }

  const obstacleFootprint = createFootprint(obstacle);

  if (obstacleFootprint.kind !== "rectangle") {
    return {
      alignmentLines: [],
      entity: candidate,
      translation: { x: 0, y: 0 },
    };
  }

  const candidateFootprint = createFootprint(candidate);
  const alignments = [
    findAxisAlignment(candidateFootprint, obstacleFootprint, obstacleFootprint.axisX, maxSnapDistance),
    findAxisAlignment(candidateFootprint, obstacleFootprint, obstacleFootprint.axisY, maxSnapDistance),
  ].filter((alignment): alignment is AxisAlignment => alignment !== null);

  if (alignments.length === 0) {
    return {
      alignmentLines: [],
      entity: candidate,
      translation: { x: 0, y: 0 },
    };
  }

  const translation = alignments.reduce(
    (current, alignment) => addVectors(current, scale(alignment.axis, alignment.delta)),
    { x: 0, y: 0 },
  );

  return {
    alignmentLines: alignments.map((alignment) => alignment.line),
    entity: createEntityWithCenter(candidate, addVectors(candidateFootprint.center, translation)),
    translation,
  };
}

type AxisAlignment = {
  axis: Vector2;
  delta: number;
  line: AuthoringPlacementGuideLine;
};

function findAxisAlignment(
  candidate: AuthoringFootprint,
  obstacle: RectangleFootprint,
  axis: Vector2,
  maxSnapDistance: number,
): AxisAlignment | null {
  const perpendicular = perpendicularTo(axis);
  const candidateProjection = projectFootprint(candidate, axis);
  const obstacleProjection = projectFootprint(obstacle, axis);
  const candidatePerpendicular = projectFootprint(candidate, perpendicular);
  const obstaclePerpendicular = projectFootprint(obstacle, perpendicular);
  const perpendicularGap = projectionGap(candidatePerpendicular, obstaclePerpendicular);

  if (
    perpendicularGap >
    maxSnapDistance * EDGE_ALIGNMENT_PERPENDICULAR_REACH_MULTIPLIER + SNAP_EPSILON
  ) {
    return null;
  }

  const candidateGuides = [
    candidateProjection.min,
    candidateProjection.center,
    candidateProjection.max,
  ];
  const obstacleGuides = [
    obstacleProjection.min,
    obstacleProjection.center,
    obstacleProjection.max,
  ];
  let best: { delta: number; target: number } | null = null;

  for (const candidateGuide of candidateGuides) {
    for (const obstacleGuide of obstacleGuides) {
      const delta = obstacleGuide - candidateGuide;

      if (Math.abs(delta) > maxSnapDistance + SNAP_EPSILON) {
        continue;
      }

      if (!best || Math.abs(delta) < Math.abs(best.delta) - SNAP_EPSILON) {
        best = {
          delta,
          target: obstacleGuide,
        };
      }
    }
  }

  if (!best || Math.abs(best.delta) <= SNAP_EPSILON) {
    return null;
  }

  const lineExtension = maxSnapDistance * ALIGNMENT_LINE_EXTENSION_RATIO;
  const startPerpendicular =
    Math.min(candidatePerpendicular.min, obstaclePerpendicular.min) - lineExtension;
  const endPerpendicular = Math.max(candidatePerpendicular.max, obstaclePerpendicular.max);

  return {
    axis,
    delta: best.delta,
    line: {
      start: roundVector(
        addVectors(scale(axis, best.target), scale(perpendicular, startPerpendicular)),
      ),
      end: roundVector(
        addVectors(scale(axis, best.target), scale(perpendicular, endPerpendicular)),
      ),
    },
  };
}

function createPlacementGuides(
  candidate: EditorSceneEntity,
  obstacle: EditorSceneEntity,
  alignmentLines: AuthoringPlacementGuideLine[],
): AuthoringPlacementGuide[] | undefined {
  if (candidate.kind === "arc-track" || obstacle.kind === "arc-track") {
    return undefined;
  }

  const obstacleFootprint = createFootprint(obstacle);

  if (obstacleFootprint.kind !== "rectangle") {
    return undefined;
  }

  const candidateFootprint = createFootprint(candidate);
  const distanceSegments = createBoardRelativeDistanceSegments(candidateFootprint, obstacleFootprint);
  const guide: AuthoringPlacementGuide = {
    alignmentLines,
    distanceSegments,
    targetEntityId: obstacle.id,
  };

  return guide.distanceSegments.length > 0 || guide.alignmentLines.length > 0
    ? [guide]
    : undefined;
}

function createBoardRelativeDistanceSegments(
  candidate: AuthoringFootprint,
  board: RectangleFootprint,
): AuthoringPlacementDistanceSegment[] {
  const candidateNormalProjection = projectFootprint(candidate, board.axisY);
  const boardNormalProjection = projectFootprint(board, board.axisY);
  const surfaceGap = Math.max(
    boardNormalProjection.min - candidateNormalProjection.max,
    candidateNormalProjection.min - boardNormalProjection.max,
    0,
  );

  if (surfaceGap > SNAP_EPSILON) {
    return [];
  }

  const localCenter = worldToLocal(candidate.center, board.center, board.axisX, board.axisY);
  const sideY = localCenter.y < 0 ? -board.halfHeight : board.halfHeight;
  const localAnchorX = clamp(localCenter.x, -board.halfWidth, board.halfWidth);
  const start = localToWorld({ x: -board.halfWidth, y: sideY }, board.center, board.axisX, board.axisY);
  const anchor = localToWorld({ x: localAnchorX, y: sideY }, board.center, board.axisX, board.axisY);
  const end = localToWorld({ x: board.halfWidth, y: sideY }, board.center, board.axisX, board.axisY);

  if (
    localAnchorX <= -board.halfWidth + SNAP_EPSILON ||
    localAnchorX >= board.halfWidth - SNAP_EPSILON
  ) {
    return [];
  }

  return [
    {
      distance: roundGuideValue(localAnchorX + board.halfWidth),
      start: roundVector(start),
      end: roundVector(anchor),
    },
    {
      distance: roundGuideValue(board.halfWidth - localAnchorX),
      start: roundVector(anchor),
      end: roundVector(end),
    },
  ];
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

function projectFootprint(footprint: AuthoringFootprint, axis: Vector2): {
  center: number;
  max: number;
  min: number;
} {
  if (footprint.kind === "circle") {
    const center = dot(footprint.center, axis);

    return {
      center,
      min: center - footprint.radius,
      max: center + footprint.radius,
    };
  }

  const values = footprint.relativeCorners.map((corner) =>
    dot(addVectors(footprint.center, corner), axis),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    center: dot(footprint.center, axis),
    min,
    max,
  };
}

function projectionGap(
  a: { max: number; min: number },
  b: { max: number; min: number },
): number {
  return Math.max(b.min - a.max, a.min - b.max, 0);
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

function perpendicularTo(vector: Vector2): Vector2 {
  return {
    x: -vector.y,
    y: vector.x,
  };
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

function roundGuideValue(value: number): number {
  return Number(value.toFixed(6));
}

function roundVector(vector: Vector2): Vector2 {
  return {
    x: roundGuideValue(vector.x),
    y: roundGuideValue(vector.y),
  };
}
