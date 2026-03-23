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

function getNextConstraintIndex(
  constraints: EditorConstraint[],
  kind: LibraryConstraintKind,
): number {
  return constraints.filter((constraint) => constraint.id.startsWith(`${kind}-`)).length + 1;
}
