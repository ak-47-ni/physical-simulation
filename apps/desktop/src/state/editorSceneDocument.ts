import {
  createEmptySceneDocument,
  createTrajectoryAnalyzer,
  type AnnotationStroke,
  type SceneConstraint,
  type SceneDocument,
  type SceneEntity,
  type Vector2,
} from "../../../../packages/scene-schema/src";

import type { EditorConstraint } from "./editorConstraints";
import type { EditorSceneEntity } from "./editorStore";

export const DEFAULT_SCENE_GRAVITY: Vector2 = { x: 0, y: 9.8 };
export const DEFAULT_GRAVITY_SOURCE_ID = "gravity-primary";
const DEFAULT_ANALYZER_ID = "traj-primary";

export type PersistedSpringConstraint = {
  entityAId: string | null;
  entityBId: string | null;
  id: string;
  kind: "spring";
  restLength: number;
  stiffness: number;
};

export type PersistedTrackConstraint = {
  axis: Vector2;
  entityId: string | null;
  id: string;
  kind: "track";
  origin: Vector2;
};

export type PersistedSceneConstraint =
  | PersistedSpringConstraint
  | PersistedTrackConstraint;

export type PersistedGravityForceSource = {
  acceleration: Vector2;
  id: string;
  kind: "gravity";
};

type CreateSceneDocumentFromEditorStateInput = {
  analyzerEntityId?: string | null;
  analyzerId?: string;
  annotations?: AnnotationStroke[];
  constraints?: EditorConstraint[];
  entities: EditorSceneEntity[];
  gravity?: Vector2;
  gravitySourceId?: string;
};

type CreateEditorSceneStateFromSceneDocumentInput = {
  scene: SceneDocument;
  selectedConstraintId?: string | null;
  selectedEntityId?: string | null;
};

export type EditorSceneDocumentState = {
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  selectedConstraintId: string | null;
  selectedEntityId: string | null;
};

export function createSceneDocumentFromEditorState(
  input: CreateSceneDocumentFromEditorStateInput,
): SceneDocument {
  const analyzerEntityId = resolveAnalyzerEntityId(input.entities, input.analyzerEntityId);
  const scene = createEmptySceneDocument();

  scene.entities = input.entities.map(mapEditorEntityToSceneEntity);
  scene.constraints = (input.constraints ?? []).map(mapEditorConstraintToSceneConstraint);
  scene.forceSources = [
    createGravityForceSource({
      acceleration: input.gravity ?? DEFAULT_SCENE_GRAVITY,
      id: input.gravitySourceId ?? DEFAULT_GRAVITY_SOURCE_ID,
    }),
  ];
  scene.analyzers = analyzerEntityId
    ? [
        createTrajectoryAnalyzer({
          entityId: analyzerEntityId,
          id: input.analyzerId ?? DEFAULT_ANALYZER_ID,
        }),
      ]
    : [];
  scene.annotations = (input.annotations ?? []).map(cloneAnnotationStroke);

  return scene;
}

export function createEditorSceneStateFromSceneDocument(
  input: CreateEditorSceneStateFromSceneDocumentInput,
): EditorSceneDocumentState {
  const entities = input.scene.entities.flatMap(mapSceneEntityToEditorEntity);
  const constraints = input.scene.constraints.flatMap(mapSceneConstraintToEditorConstraint);

  return {
    constraints,
    entities,
    selectedConstraintId: resolveSelectedId(
      input.selectedConstraintId,
      constraints.map((constraint) => constraint.id),
    ),
    selectedEntityId: resolveSelectedId(
      input.selectedEntityId,
      entities.map((entity) => entity.id),
    ),
  };
}

export function createGravityForceSource(input?: {
  acceleration?: Vector2;
  id?: string;
}): PersistedGravityForceSource {
  return {
    acceleration: cloneVector(input?.acceleration ?? DEFAULT_SCENE_GRAVITY),
    id: input?.id ?? DEFAULT_GRAVITY_SOURCE_ID,
    kind: "gravity",
  };
}

export function isPersistedSpringConstraint(
  value: SceneConstraint,
): value is PersistedSpringConstraint {
  return (
    value.kind === "spring" &&
    readNullableString(value, "entityAId") !== undefined &&
    readNullableString(value, "entityBId") !== undefined &&
    typeof readNumber(value, "restLength") === "number" &&
    typeof readNumber(value, "stiffness") === "number"
  );
}

export function isPersistedTrackConstraint(
  value: SceneConstraint,
): value is PersistedTrackConstraint {
  return (
    value.kind === "track" &&
    readNullableString(value, "entityId") !== undefined &&
    readVector(value, "origin") !== undefined &&
    readVector(value, "axis") !== undefined
  );
}

export function isPersistedGravityForceSource(
  value: { id: string; kind: string },
): value is PersistedGravityForceSource {
  return value.kind === "gravity" && readVector(value, "acceleration") !== undefined;
}

export function resolveAnalyzerEntityId(
  entities: EditorSceneEntity[],
  explicitEntityId?: string | null,
): string | null {
  if (explicitEntityId && entities.some((entity) => entity.id === explicitEntityId)) {
    return explicitEntityId;
  }

  return entities.find((entity) => !entity.locked)?.id ?? entities[0]?.id ?? null;
}

function mapEditorEntityToSceneEntity(entity: EditorSceneEntity): SceneEntity {
  const physics = {
    friction: entity.friction,
    locked: entity.locked,
    mass: entity.mass,
    restitution: entity.restitution,
    velocityX: entity.velocityX,
    velocityY: entity.velocityY,
  };

  if (entity.kind === "ball") {
    return {
      ...physics,
      id: entity.id,
      kind: "ball",
      label: entity.label,
      radius: entity.radius,
      x: entity.x,
      y: entity.y,
    };
  }

  return {
    ...physics,
    height: entity.height,
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    width: entity.width,
    x: entity.x,
    y: entity.y,
  };
}

function mapEditorConstraintToSceneConstraint(
  constraint: EditorConstraint,
): PersistedSceneConstraint {
  if (constraint.kind === "spring") {
    return {
      entityAId: constraint.entityAId,
      entityBId: constraint.entityBId,
      id: constraint.id,
      kind: "spring",
      restLength: constraint.restLength,
      stiffness: constraint.stiffness,
    };
  }

  return {
    axis: cloneVector(constraint.axis),
    entityId: constraint.entityId,
    id: constraint.id,
    kind: "track",
    origin: cloneVector(constraint.origin),
  };
}

function mapSceneEntityToEditorEntity(entity: SceneEntity): EditorSceneEntity[] {
  if (entity.kind === "user-polygon") {
    return [];
  }

  const physics = {
    friction: entity.friction ?? 0,
    locked: entity.locked ?? false,
    mass: entity.mass ?? 0,
    restitution: entity.restitution ?? 0,
    velocityX: entity.velocityX ?? 0,
    velocityY: entity.velocityY ?? 0,
  };

  if ("radius" in entity) {
    return [
      {
        ...physics,
        id: entity.id,
        kind: "ball",
        label: entity.label ?? entity.id,
        radius: entity.radius,
        x: entity.x,
        y: entity.y,
      },
    ];
  }

  return [
    {
      ...physics,
      height: entity.height,
      id: entity.id,
      kind: entity.kind,
      label: entity.label ?? entity.id,
      width: entity.width,
      x: entity.x,
      y: entity.y,
    },
  ];
}

function mapSceneConstraintToEditorConstraint(
  constraint: SceneConstraint,
): EditorConstraint[] {
  if (isPersistedSpringConstraint(constraint)) {
    return [
      {
        entityAId: constraint.entityAId,
        entityBId: constraint.entityBId,
        id: constraint.id,
        kind: "spring",
        label: `Spring ${constraint.id.split("-").at(-1) ?? constraint.id}`,
        restLength: constraint.restLength,
        stiffness: constraint.stiffness,
      },
    ];
  }

  if (isPersistedTrackConstraint(constraint)) {
    return [
      {
        axis: cloneVector(constraint.axis),
        entityId: constraint.entityId,
        id: constraint.id,
        kind: "track",
        label: `Track ${constraint.id.split("-").at(-1) ?? constraint.id}`,
        origin: cloneVector(constraint.origin),
      },
    ];
  }

  return [];
}

function cloneAnnotationStroke(stroke: AnnotationStroke): AnnotationStroke {
  return {
    id: stroke.id,
    points: stroke.points.map(cloneVector),
  };
}

function cloneVector(vector: Vector2): Vector2 {
  return { ...vector };
}

function readNullableString<T extends object, K extends string>(
  value: T,
  key: K,
): string | null | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  return candidate === null || typeof candidate === "string" ? candidate : undefined;
}

function readNumber<T extends object, K extends string>(value: T, key: K): number | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "number" ? candidate : undefined;
}

function readVector<T extends object, K extends string>(value: T, key: K): Vector2 | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  if (
    candidate &&
    typeof candidate === "object" &&
    "x" in candidate &&
    "y" in candidate &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number"
  ) {
    return {
      x: candidate.x,
      y: candidate.y,
    };
  }

  return undefined;
}

function resolveSelectedId(
  selectedId: string | null | undefined,
  validIds: string[],
): string | null {
  return selectedId && validIds.includes(selectedId) ? selectedId : null;
}
