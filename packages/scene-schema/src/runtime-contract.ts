import {
  cloneSceneDocument,
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type ForceSource,
  type SceneConstraint,
  type SceneDocument,
  type Vector2,
} from "./schema";

export type RuntimeEntityFrame = {
  entityId: string;
  position: Vector2;
  rotation: number;
  velocity?: Vector2;
  acceleration?: Vector2;
};

export type RuntimeFramePayload = {
  frameNumber: number;
  entities: RuntimeEntityFrame[];
};

export type RuntimeCompileRequest = {
  scene: SceneDocument;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
};

export type RuntimeCompileConstraint = SceneConstraint;

export type RuntimeCompileForceSource = ForceSource;

export function createRuntimeFramePayload(input: RuntimeFramePayload): RuntimeFramePayload {
  return {
    frameNumber: input.frameNumber,
    entities: input.entities.map((entity) => ({
      ...entity,
      position: { ...entity.position },
      velocity: entity.velocity ? { ...entity.velocity } : undefined,
      acceleration: entity.acceleration ? { ...entity.acceleration } : undefined,
    })),
  };
}

export function createRuntimeCompileRequest(
  scene: SceneDocument,
  dirtyScopes: DirtyEditScope[] = [],
): RuntimeCompileRequest {
  return {
    scene: cloneSceneDocument(scene),
    dirtyScopes: [...dirtyScopes],
    rebuildRequired: requiresRuntimeRebuild(dirtyScopes),
  };
}
