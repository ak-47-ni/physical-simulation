import type { EditorSceneEntity } from "./editorStore";

const GEOMETRY_EPSILON = 1e-9;

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
  corners: [Vector2, Vector2, Vector2, Vector2];
  halfHeight: number;
  halfWidth: number;
  kind: "rectangle";
};

type AuthoringFootprint = CircleFootprint | RectangleFootprint;

export type AuthoringOverlap = {
  entityId: string;
  label: string;
};

export function createRepositionedEntity<T extends EditorSceneEntity>(
  entity: T,
  position: { x: number; y: number },
): T {
  return {
    ...entity,
    x: position.x,
    y: position.y,
  };
}

export function findAuthoringOverlap(input: {
  candidate: EditorSceneEntity;
  entities: EditorSceneEntity[];
  ignoreEntityId?: string;
}): AuthoringOverlap | null {
  const { candidate, entities, ignoreEntityId } = input;

  for (const entity of entities) {
    if (entity.id === ignoreEntityId) {
      continue;
    }

    if (!entitiesPenetrate(candidate, entity)) {
      continue;
    }

    return {
      entityId: entity.id,
      label: entity.label,
    };
  }

  return null;
}

export function canPlaceAuthoringEntity(input: {
  candidate: EditorSceneEntity;
  entities: EditorSceneEntity[];
  ignoreEntityId?: string;
}): boolean {
  return findAuthoringOverlap(input) === null;
}

function entitiesPenetrate(a: EditorSceneEntity, b: EditorSceneEntity): boolean {
  const footprintA = createFootprint(a);
  const footprintB = createFootprint(b);

  if (footprintA.kind === "circle" && footprintB.kind === "circle") {
    return circlesPenetrate(footprintA, footprintB);
  }

  if (footprintA.kind === "circle" && footprintB.kind === "rectangle") {
    return circlePenetratesRectangle(footprintA, footprintB);
  }

  if (footprintA.kind === "rectangle" && footprintB.kind === "circle") {
    return circlePenetratesRectangle(footprintB, footprintA);
  }

  return rectanglesPenetrate(footprintA, footprintB);
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

  return {
    kind: "rectangle",
    center,
    axisX,
    axisY,
    halfWidth,
    halfHeight,
    corners: [
      addVectors(center, scaleAndAdd(scale(axisX, -halfWidth), axisY, -halfHeight)),
      addVectors(center, scaleAndAdd(scale(axisX, halfWidth), axisY, -halfHeight)),
      addVectors(center, scaleAndAdd(scale(axisX, halfWidth), axisY, halfHeight)),
      addVectors(center, scaleAndAdd(scale(axisX, -halfWidth), axisY, halfHeight)),
    ],
  };
}

function circlesPenetrate(a: CircleFootprint, b: CircleFootprint): boolean {
  const distanceSquared = squaredLength(subtract(a.center, b.center));
  const radiusSum = a.radius + b.radius;

  return distanceSquared < radiusSum * radiusSum - GEOMETRY_EPSILON;
}

function circlePenetratesRectangle(
  circle: CircleFootprint,
  rectangle: RectangleFootprint,
): boolean {
  const relativeCenter = subtract(circle.center, rectangle.center);
  const localX = dot(relativeCenter, rectangle.axisX);
  const localY = dot(relativeCenter, rectangle.axisY);
  const closestPoint = {
    x: clamp(localX, -rectangle.halfWidth, rectangle.halfWidth),
    y: clamp(localY, -rectangle.halfHeight, rectangle.halfHeight),
  };
  const delta = {
    x: localX - closestPoint.x,
    y: localY - closestPoint.y,
  };

  return squaredLength(delta) < circle.radius * circle.radius - GEOMETRY_EPSILON;
}

function rectanglesPenetrate(
  a: RectangleFootprint,
  b: RectangleFootprint,
): boolean {
  const axes = [a.axisX, a.axisY, b.axisX, b.axisY];

  for (const axis of axes) {
    const projectionA = projectCorners(a.corners, axis);
    const projectionB = projectCorners(b.corners, axis);

    if (
      projectionA.max <= projectionB.min + GEOMETRY_EPSILON ||
      projectionB.max <= projectionA.min + GEOMETRY_EPSILON
    ) {
      return false;
    }
  }

  return true;
}

function projectCorners(corners: RectangleFootprint["corners"], axis: Vector2) {
  let min = dot(corners[0], axis);
  let max = min;

  for (let index = 1; index < corners.length; index += 1) {
    const projection = dot(corners[index], axis);

    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }

  return { min, max };
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

function squaredLength(vector: Vector2): number {
  return dot(vector, vector);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
