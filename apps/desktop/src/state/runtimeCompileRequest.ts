import {
  SCENE_SCHEMA_VERSION,
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type SceneDocument as LegacySceneDocument,
  type Vector2,
} from "../../../../packages/scene-schema/src";

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
};

export type RuntimeSceneEntity =
  | RuntimeBallSceneEntity
  | RuntimeSizedSceneEntity
  | RuntimeUserPolygonEntity;

export type RuntimeSceneRecord = {
  id: string;
  kind: string;
};

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
  constraints: RuntimeSceneRecord[];
  forceSources: RuntimeSceneRecord[];
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
  dirtyScopes?: DirtyEditScope[];
  entities: EditorSceneEntity[];
};

const DEFAULT_ANALYZER_ID = "traj-primary";

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
  const analyzerEntityId = resolveAnalyzerEntityId(input.entities, input.analyzerEntityId);
  const scene = createEmptyRuntimeSceneDocument();

  scene.entities = input.entities.map(mapEditorEntityToRuntimeEntity);
  scene.annotations = (input.annotations ?? []).map(cloneRuntimeAnnotationStroke);
  scene.analyzers = analyzerEntityId
    ? [
        {
          id: input.analyzerId ?? DEFAULT_ANALYZER_ID,
          kind: "trajectory",
          entityId: analyzerEntityId,
        },
      ]
    : [];

  return createRuntimeCompileRequest(scene, input.dirtyScopes);
}

export function cloneRuntimeSceneDocument(
  scene: RuntimeSceneDocument | LegacySceneDocument,
): RuntimeSceneDocument {
  return {
    schemaVersion: scene.schemaVersion,
    entities: scene.entities.map(cloneRuntimeSceneEntity),
    constraints: scene.constraints.map((constraint) => ({
      id: constraint.id,
      kind: constraint.kind,
    })),
    forceSources: scene.forceSources.map((source) => ({
      id: source.id,
      kind: source.kind,
    })),
    analyzers: scene.analyzers.map(cloneRuntimeSceneAnalyzer),
    annotations: scene.annotations.map(cloneRuntimeAnnotationStroke),
  };
}

function mapEditorEntityToRuntimeEntity(entity: EditorSceneEntity): RuntimeSceneEntity {
  const physics = {
    mass: entity.mass,
    friction: entity.friction,
    restitution: entity.restitution,
    locked: entity.locked,
    velocityX: entity.velocityX,
    velocityY: entity.velocityY,
  };

  if (entity.kind === "ball") {
    return {
      id: entity.id,
      kind: "ball",
      label: entity.label,
      x: entity.x,
      y: entity.y,
      radius: entity.radius,
      ...physics,
    };
  }

  return {
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    ...physics,
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

function cloneRuntimeAnnotationStroke(
  stroke: AnnotationInput | RuntimeAnnotationStroke,
): RuntimeAnnotationStroke {
  return {
    id: stroke.id,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function resolveAnalyzerEntityId(
  entities: EditorSceneEntity[],
  explicitEntityId?: string | null,
): string | null {
  if (explicitEntityId && entities.some((entity) => entity.id === explicitEntityId)) {
    return explicitEntityId;
  }

  return entities.find((entity) => !entity.locked)?.id ?? entities[0]?.id ?? null;
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
