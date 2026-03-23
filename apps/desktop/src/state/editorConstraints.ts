import type { Vector2 } from "../../../../packages/scene-schema/src";

export type LibraryConstraintKind = "spring" | "track";

export type EditorSpringConstraint = {
  id: string;
  kind: "spring";
  label: string;
  entityAId: string | null;
  entityBId: string | null;
  restLength: number;
  stiffness: number;
};

export type EditorTrackConstraint = {
  id: string;
  kind: "track";
  label: string;
  entityId: string | null;
  origin: Vector2;
  axis: Vector2;
};

export type EditorConstraint = EditorSpringConstraint | EditorTrackConstraint;

const DEFAULT_SPRING_REST_LENGTH = 120;
const DEFAULT_SPRING_STIFFNESS = 24;
const DEFAULT_TRACK_ORIGIN: Vector2 = { x: 0, y: 0 };
const DEFAULT_TRACK_AXIS: Vector2 = { x: 1, y: 0 };

const CONSTRAINT_LABELS: Record<LibraryConstraintKind, string> = {
  spring: "Spring",
  track: "Track",
};

export function createDefaultEditorConstraint(
  constraints: EditorConstraint[],
  kind: LibraryConstraintKind,
): EditorConstraint {
  const nextIndex = getNextConstraintIndex(constraints, kind);
  const baseConstraint = {
    id: `${kind}-${nextIndex}`,
    kind,
    label: `${CONSTRAINT_LABELS[kind]} ${nextIndex}`,
  } as const;

  if (kind === "spring") {
    return {
      ...baseConstraint,
      kind: "spring",
      entityAId: null,
      entityBId: null,
      restLength: DEFAULT_SPRING_REST_LENGTH,
      stiffness: DEFAULT_SPRING_STIFFNESS,
    };
  }

  return {
    ...baseConstraint,
    kind: "track",
    entityId: null,
    origin: { ...DEFAULT_TRACK_ORIGIN },
    axis: { ...DEFAULT_TRACK_AXIS },
  };
}

export function createSpringConstraintFromEntities(
  constraints: EditorConstraint[],
  entities: {
    id: string;
    x: number;
    y: number;
  }[],
): EditorSpringConstraint {
  const [entityA, entityB] = entities;
  const spring = createDefaultEditorConstraint(constraints, "spring");

  if (spring.kind !== "spring" || !entityA || !entityB) {
    throw new Error("A spring requires two entities.");
  }

  return {
    ...spring,
    entityAId: entityA.id,
    entityBId: entityB.id,
    restLength: Math.round(Math.hypot(entityB.x - entityA.x, entityB.y - entityA.y)),
  };
}

export function createTrackConstraintFromEntityAndPoint(
  constraints: EditorConstraint[],
  entity: {
    id: string;
    x: number;
    y: number;
  },
  point: Vector2,
): EditorTrackConstraint {
  const track = createDefaultEditorConstraint(constraints, "track");

  if (track.kind !== "track") {
    throw new Error("Track creation returned an unexpected constraint kind.");
  }

  const axis = {
    x: point.x - entity.x,
    y: point.y - entity.y,
  };

  if (axis.x === 0 && axis.y === 0) {
    return {
      ...track,
      entityId: entity.id,
      origin: { x: entity.x, y: entity.y },
    };
  }

  return {
    ...track,
    entityId: entity.id,
    origin: { x: entity.x, y: entity.y },
    axis,
  };
}

function getNextConstraintIndex(
  constraints: EditorConstraint[],
  kind: LibraryConstraintKind,
): number {
  return constraints.filter((constraint) => constraint.id.startsWith(`${kind}-`)).length + 1;
}
