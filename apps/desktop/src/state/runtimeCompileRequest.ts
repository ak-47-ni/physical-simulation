import {
  SCENE_SCHEMA_VERSION,
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type SceneDocument as LegacySceneDocument,
  type Vector2,
} from "../../../../packages/scene-schema/src";

import {
  createDefaultSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "./sceneAuthoringSettings";
import type { EditorConstraint } from "./editorConstraints";
import {
  createSceneDocumentFromEditorState,
  isPersistedGravityForceSource,
  isPersistedSpringConstraint,
  isPersistedTrackConstraint,
  type PersistedGravityForceSource,
  type PersistedSceneConstraint,
} from "./editorSceneDocument";
import {
  normalizeGravityToSi,
  normalizeLengthToSi,
  normalizeMassToSi,
  normalizeVelocityToSi,
} from "./sceneUnits";
import type { EditorSceneEntity } from "./editorStore";

export type RuntimeSceneEntityPhysics = {
  mass?: number;
  friction?: number;
  restitution?: number;
  locked?: boolean;
  velocityX?: number;
  velocityY?: number;
};

type RuntimeBaseSceneEntity = {
  id: string;
  label?: string;
} & RuntimeSceneEntityPhysics;

export type RuntimeUserPolygonEntity = RuntimeBaseSceneEntity & {
  kind: "user-polygon";
  points: Vector2[];
};

export type RuntimeBallSceneEntity = RuntimeBaseSceneEntity & {
  kind: "ball";
  x: number;
  y: number;
  radius: number;
};

export type RuntimeSizedSceneEntity = RuntimeBaseSceneEntity & {
  kind: "block" | "board" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  rotationRadians?: number;
};

export type RuntimeSceneEntity =
  | RuntimeBallSceneEntity
  | RuntimeSizedSceneEntity
  | RuntimeUserPolygonEntity;

export type RuntimeSceneRecord = {
  id: string;
  kind: string;
};

export type RuntimeSceneConstraint = PersistedSceneConstraint | RuntimeSceneRecord;
export type RuntimeForceSource = PersistedGravityForceSource | RuntimeSceneRecord;

export type RuntimeSceneAnalyzer = RuntimeSceneRecord & {
  entityId?: string;
};

export type RuntimeAnnotationStroke = {
  id: string;
  points: Vector2[];
};

export type RuntimeSceneDocument = {
  schemaVersion: number;
  entities: RuntimeSceneEntity[];
  constraints: RuntimeSceneConstraint[];
  forceSources: RuntimeForceSource[];
  analyzers: RuntimeSceneAnalyzer[];
  annotations: RuntimeAnnotationStroke[];
};

export type RuntimeCompileRequest = {
  scene: RuntimeSceneDocument;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
};

type AnnotationInput = {
  id: string;
  points: Vector2[];
};

type CreateRuntimeCompileRequestFromEditorStateInput = {
  analyzerEntityId?: string | null;
  analyzerId?: string;
  annotations?: AnnotationInput[];
  constraints?: EditorConstraint[];
  dirtyScopes?: DirtyEditScope[];
  entities: EditorSceneEntity[];
  settings?: SceneAuthoringSettings;
};

export function createEmptyRuntimeSceneDocument(): RuntimeSceneDocument {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    entities: [],
    constraints: [],
    forceSources: [],
    analyzers: [],
    annotations: [],
  };
}

export function createRuntimeCompileRequest(
  scene: RuntimeSceneDocument | LegacySceneDocument,
  dirtyScopes: DirtyEditScope[] = [],
): RuntimeCompileRequest {
  return {
    scene: cloneRuntimeSceneDocument(scene),
    dirtyScopes: [...dirtyScopes],
    rebuildRequired: requiresRuntimeRebuild(dirtyScopes),
  };
}

export function createRuntimeCompileRequestFromEditorState(
  input: CreateRuntimeCompileRequestFromEditorStateInput,
): RuntimeCompileRequest {
  const settings = input.settings ?? createDefaultSceneAuthoringSettings();

  return createRuntimeCompileRequest(
    normalizeRuntimeSceneDocumentToSi(
      createSceneDocumentFromEditorState({
        analyzerEntityId: input.analyzerEntityId,
        analyzerId: input.analyzerId,
        annotations: input.annotations,
        constraints: input.constraints,
        entities: input.entities,
        gravity: {
          x: 0,
          y: settings.gravity,
        },
      }),
      settings,
    ),
    input.dirtyScopes,
  );
}

export function cloneRuntimeSceneDocument(
  scene: RuntimeSceneDocument | LegacySceneDocument,
): RuntimeSceneDocument {
  return {
    schemaVersion: scene.schemaVersion,
    entities: scene.entities.map(cloneRuntimeSceneEntity),
    constraints: scene.constraints.map(cloneRuntimeSceneConstraint),
    forceSources: scene.forceSources.map(cloneRuntimeForceSource),
    analyzers: scene.analyzers.map(cloneRuntimeSceneAnalyzer),
    annotations: scene.annotations.map(cloneRuntimeAnnotationStroke),
  };
}

function cloneRuntimeSceneEntity(
  entity: RuntimeSceneDocument["entities"][number] | LegacySceneDocument["entities"][number],
): RuntimeSceneEntity {
  const physics = readOptionalPhysics(entity);
  const label = readOptionalString(entity, "label");

  if (entity.kind === "user-polygon") {
    return {
      id: entity.id,
      kind: "user-polygon",
      ...(label !== undefined ? { label } : {}),
      ...physics,
      points: entity.points.map((point) => ({ ...point })),
    };
  }

  if ("radius" in entity) {
    return {
      id: entity.id,
      kind: "ball",
      ...(label !== undefined ? { label } : {}),
      ...physics,
      x: entity.x,
      y: entity.y,
      radius: entity.radius,
    };
  }

  return {
    id: entity.id,
    kind: entity.kind,
    ...(label !== undefined ? { label } : {}),
    ...physics,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    rotationRadians: readEntityRotationRadians(entity),
  };
}

function cloneRuntimeSceneAnalyzer(
  analyzer: RuntimeSceneDocument["analyzers"][number] | LegacySceneDocument["analyzers"][number],
): RuntimeSceneAnalyzer {
  const entityId = readOptionalString(analyzer, "entityId");

  return {
    id: analyzer.id,
    kind: analyzer.kind,
    ...(entityId !== undefined ? { entityId } : {}),
  };
}

function cloneRuntimeSceneConstraint(
  constraint:
    | RuntimeSceneDocument["constraints"][number]
    | LegacySceneDocument["constraints"][number],
): RuntimeSceneConstraint {
  if (isPersistedSpringConstraint(constraint)) {
    return {
      entityAId: constraint.entityAId,
      entityBId: constraint.entityBId,
      id: constraint.id,
      kind: "spring",
      restLength: constraint.restLength,
      stiffness: constraint.stiffness,
    };
  }

  if (isPersistedTrackConstraint(constraint)) {
    return {
      axis: { ...constraint.axis },
      entityId: constraint.entityId,
      id: constraint.id,
      kind: "track",
      origin: { ...constraint.origin },
    };
  }

  return {
    id: constraint.id,
    kind: constraint.kind,
  };
}

function cloneRuntimeForceSource(
  source: RuntimeSceneDocument["forceSources"][number] | LegacySceneDocument["forceSources"][number],
): RuntimeForceSource {
  if (isPersistedGravityForceSource(source)) {
    return {
      acceleration: { ...source.acceleration },
      id: source.id,
      kind: "gravity",
    };
  }

  return {
    id: source.id,
    kind: source.kind,
  };
}

function cloneRuntimeAnnotationStroke(
  stroke: AnnotationInput | RuntimeAnnotationStroke,
): RuntimeAnnotationStroke {
  return {
    id: stroke.id,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function normalizeRuntimeSceneDocumentToSi(
  scene: RuntimeSceneDocument | LegacySceneDocument,
  settings: SceneAuthoringSettings,
): RuntimeSceneDocument {
  const clonedScene = cloneRuntimeSceneDocument(scene);

  return {
    ...clonedScene,
    entities: clonedScene.entities.map((entity) => normalizeRuntimeSceneEntityToSi(entity, settings)),
    constraints: clonedScene.constraints.map((constraint) =>
      normalizeRuntimeSceneConstraintToSi(constraint, settings),
    ),
    forceSources: clonedScene.forceSources.map((source) =>
      normalizeRuntimeForceSourceToSi(source, settings),
    ),
  };
}

function normalizeRuntimeSceneEntityToSi(
  entity: RuntimeSceneEntity,
  settings: SceneAuthoringSettings,
): RuntimeSceneEntity {
  const physics = {
    ...(entity.mass !== undefined ? { mass: normalizeMassToSi(entity.mass, settings.massUnit) } : {}),
    ...(entity.friction !== undefined ? { friction: entity.friction } : {}),
    ...(entity.restitution !== undefined ? { restitution: entity.restitution } : {}),
    ...(entity.locked !== undefined ? { locked: entity.locked } : {}),
    ...(entity.velocityX !== undefined
      ? { velocityX: normalizeVelocityToSi(entity.velocityX, settings.velocityUnit) }
      : {}),
    ...(entity.velocityY !== undefined
      ? { velocityY: normalizeVelocityToSi(entity.velocityY, settings.velocityUnit) }
      : {}),
  };

  if (entity.kind === "user-polygon") {
    return {
      ...entity,
      ...physics,
      points: entity.points.map((point) => ({
        x: normalizeLengthToSi(point.x, settings.lengthUnit),
        y: normalizeLengthToSi(point.y, settings.lengthUnit),
      })),
    };
  }

  if (entity.kind === "ball") {
    return {
      ...entity,
      ...physics,
      x: normalizeLengthToSi(entity.x, settings.lengthUnit),
      y: normalizeLengthToSi(entity.y, settings.lengthUnit),
      radius: normalizeLengthToSi(entity.radius, settings.lengthUnit),
    };
  }

  return {
    ...entity,
    ...physics,
    x: normalizeLengthToSi(entity.x, settings.lengthUnit),
    y: normalizeLengthToSi(entity.y, settings.lengthUnit),
    width: normalizeLengthToSi(entity.width, settings.lengthUnit),
    height: normalizeLengthToSi(entity.height, settings.lengthUnit),
    rotationRadians: entity.rotationRadians ?? 0,
  };
}

function normalizeRuntimeSceneConstraintToSi(
  constraint: RuntimeSceneConstraint,
  settings: SceneAuthoringSettings,
): RuntimeSceneConstraint {
  if (isPersistedSpringConstraint(constraint)) {
    return {
      ...constraint,
      restLength: normalizeLengthToSi(constraint.restLength, settings.lengthUnit),
    };
  }

  if (isPersistedTrackConstraint(constraint)) {
    return {
      ...constraint,
      origin: {
        x: normalizeLengthToSi(constraint.origin.x, settings.lengthUnit),
        y: normalizeLengthToSi(constraint.origin.y, settings.lengthUnit),
      },
      axis: {
        x: normalizeLengthToSi(constraint.axis.x, settings.lengthUnit),
        y: normalizeLengthToSi(constraint.axis.y, settings.lengthUnit),
      },
    };
  }

  return constraint;
}

function normalizeRuntimeForceSourceToSi(
  source: RuntimeForceSource,
  settings: SceneAuthoringSettings,
): RuntimeForceSource {
  if (!isPersistedGravityForceSource(source)) {
    return source;
  }

  return {
    ...source,
    acceleration: {
      x: normalizeGravityToSi(source.acceleration.x, settings.lengthUnit),
      y: normalizeGravityToSi(source.acceleration.y, settings.lengthUnit),
    },
  };
}

function readOptionalPhysics(
  entity: Partial<RuntimeSceneEntityPhysics>,
): RuntimeSceneEntityPhysics {
  return {
    ...(entity.mass !== undefined ? { mass: entity.mass } : {}),
    ...(entity.friction !== undefined ? { friction: entity.friction } : {}),
    ...(entity.restitution !== undefined ? { restitution: entity.restitution } : {}),
    ...(entity.locked !== undefined ? { locked: entity.locked } : {}),
    ...(entity.velocityX !== undefined ? { velocityX: entity.velocityX } : {}),
    ...(entity.velocityY !== undefined ? { velocityY: entity.velocityY } : {}),
  };
}

function readOptionalString<T extends object, K extends keyof T>(value: T, key: K): string | undefined {
  const candidate = value[key];

  return typeof candidate === "string" ? candidate : undefined;
}

function readOptionalNumber(value: object, key: string): number | undefined {
  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "number" ? candidate : undefined;
}

function readEntityRotationRadians(
  entity: RuntimeSceneDocument["entities"][number] | LegacySceneDocument["entities"][number],
): number {
  const runtimeRadians = readOptionalNumber(entity, "rotationRadians");

  if (runtimeRadians !== undefined) {
    return runtimeRadians;
  }

  const authoredDegrees = readOptionalNumber(entity, "rotationDegrees");

  if (authoredDegrees !== undefined) {
    return (authoredDegrees * Math.PI) / 180;
  }

  return 0;
}
