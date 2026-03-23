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
import {
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "./sceneAuthoringSettings";
import {
  convertGravityValue,
  convertLengthValue,
  convertMassValue,
  convertVelocityValue,
  type LengthUnit,
  type MassUnit,
  type VelocityUnit,
} from "./sceneUnits";
import type { EditorSceneEntity } from "./editorStore";

export const DEFAULT_SCENE_GRAVITY: Vector2 = { x: 0, y: 9.8 };
export const DEFAULT_GRAVITY_SOURCE_ID = "gravity-primary";
const DEFAULT_ANALYZER_ID = "traj-primary";

export type PersistedSpringConstraint = {
  entityAId: string;
  entityBId: string;
  id: string;
  kind: "spring";
  restLength: number;
  stiffness: number;
};

export type PersistedTrackConstraint = {
  axis: Vector2;
  entityId: string;
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

type ConvertSceneAuthoringUnitsInput = {
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  settings: SceneAuthoringSettings;
  units: {
    lengthUnit?: LengthUnit;
    velocityUnit?: VelocityUnit;
    massUnit?: MassUnit;
  };
};

export type ConvertedSceneAuthoringState = {
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  settings: SceneAuthoringSettings;
};

export function createSceneDocumentFromEditorState(
  input: CreateSceneDocumentFromEditorStateInput,
): SceneDocument {
  const analyzerEntityId = resolveAnalyzerEntityId(input.entities, input.analyzerEntityId);
  const scene = createEmptySceneDocument();

  scene.entities = input.entities.map(mapEditorEntityToSceneEntity);
  scene.constraints = (input.constraints ?? []).flatMap(mapEditorConstraintToSceneConstraint);
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

export function convertSceneAuthoringUnits(
  input: ConvertSceneAuthoringUnitsInput,
): ConvertedSceneAuthoringState {
  const nextSettings = createSceneAuthoringSettings({
    ...input.settings,
    lengthUnit: input.units.lengthUnit ?? input.settings.lengthUnit,
    velocityUnit: input.units.velocityUnit ?? input.settings.velocityUnit,
    massUnit: input.units.massUnit ?? input.settings.massUnit,
    gravity: convertGravityValue(
      input.settings.gravity,
      input.settings.lengthUnit,
      input.units.lengthUnit ?? input.settings.lengthUnit,
    ),
  });

  return {
    constraints: input.constraints.map((constraint) =>
      convertEditorConstraintUnits(constraint, input.settings, nextSettings),
    ),
    entities: input.entities.map((entity) =>
      convertEditorEntityUnits(entity, input.settings, nextSettings),
    ),
    settings: nextSettings,
  };
}

export function isPersistedSpringConstraint(
  value: { id: string; kind: string },
): value is PersistedSpringConstraint {
  return (
    value.kind === "spring" &&
    typeof readString(value, "entityAId") === "string" &&
    typeof readString(value, "entityBId") === "string" &&
    typeof readNumber(value, "restLength") === "number" &&
    typeof readNumber(value, "stiffness") === "number"
  );
}

export function isPersistedTrackConstraint(
  value: { id: string; kind: string },
): value is PersistedTrackConstraint {
  return (
    value.kind === "track" &&
    typeof readString(value, "entityId") === "string" &&
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
): PersistedSceneConstraint[] {
  if (constraint.kind === "spring") {
    if (!constraint.entityAId || !constraint.entityBId) {
      return [];
    }

    const sceneConstraint: PersistedSpringConstraint = {
      entityAId: constraint.entityAId,
      entityBId: constraint.entityBId,
      id: constraint.id,
      kind: "spring",
      restLength: constraint.restLength,
      stiffness: constraint.stiffness,
    };

    return [sceneConstraint];
  }

  if (!constraint.entityId) {
    return [];
  }

  const sceneConstraint: PersistedTrackConstraint = {
    axis: cloneVector(constraint.axis),
    entityId: constraint.entityId,
    id: constraint.id,
    kind: "track",
    origin: cloneVector(constraint.origin),
  };

  return [sceneConstraint];
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

function convertEditorEntityUnits(
  entity: EditorSceneEntity,
  fromSettings: SceneAuthoringSettings,
  toSettings: SceneAuthoringSettings,
): EditorSceneEntity {
  const convertedBase = {
    ...entity,
    mass: convertMassValue(entity.mass, fromSettings.massUnit, toSettings.massUnit),
    velocityX: convertVelocityValue(
      entity.velocityX,
      fromSettings.velocityUnit,
      toSettings.velocityUnit,
    ),
    velocityY: convertVelocityValue(
      entity.velocityY,
      fromSettings.velocityUnit,
      toSettings.velocityUnit,
    ),
    x: convertLengthValue(entity.x, fromSettings.lengthUnit, toSettings.lengthUnit),
    y: convertLengthValue(entity.y, fromSettings.lengthUnit, toSettings.lengthUnit),
  };

  if (entity.kind === "ball") {
    return {
      ...convertedBase,
      kind: "ball",
      radius: convertLengthValue(
        entity.radius,
        fromSettings.lengthUnit,
        toSettings.lengthUnit,
      ),
    };
  }

  return {
    ...convertedBase,
    kind: entity.kind,
    width: convertLengthValue(entity.width, fromSettings.lengthUnit, toSettings.lengthUnit),
    height: convertLengthValue(entity.height, fromSettings.lengthUnit, toSettings.lengthUnit),
  };
}

function convertEditorConstraintUnits(
  constraint: EditorConstraint,
  fromSettings: SceneAuthoringSettings,
  toSettings: SceneAuthoringSettings,
): EditorConstraint {
  if (constraint.kind === "spring") {
    return {
      ...constraint,
      restLength: convertLengthValue(
        constraint.restLength,
        fromSettings.lengthUnit,
        toSettings.lengthUnit,
      ),
    };
  }

  return {
    ...constraint,
    origin: {
      x: convertLengthValue(constraint.origin.x, fromSettings.lengthUnit, toSettings.lengthUnit),
      y: convertLengthValue(constraint.origin.y, fromSettings.lengthUnit, toSettings.lengthUnit),
    },
    axis: {
      x: convertLengthValue(constraint.axis.x, fromSettings.lengthUnit, toSettings.lengthUnit),
      y: convertLengthValue(constraint.axis.y, fromSettings.lengthUnit, toSettings.lengthUnit),
    },
  };
}

function readNullableString<T extends object, K extends string>(
  value: T,
  key: K,
): string | null | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  return candidate === null || typeof candidate === "string" ? candidate : undefined;
}

function readString<T extends object, K extends string>(value: T, key: K): string | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "string" ? candidate : undefined;
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
