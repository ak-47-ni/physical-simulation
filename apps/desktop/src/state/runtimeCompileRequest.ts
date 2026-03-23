import {
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type SceneDocument,
} from "../../../../packages/scene-schema/src";

export type RuntimeCompileRequest = {
  scene: SceneDocument;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
};

export function createRuntimeCompileRequest(
  scene: SceneDocument,
  dirtyScopes: DirtyEditScope[] = [],
): RuntimeCompileRequest {
  return {
    scene: cloneRuntimeSceneDocument(scene),
    dirtyScopes: [...dirtyScopes],
    rebuildRequired: requiresRuntimeRebuild(dirtyScopes),
  };
}

export function cloneRuntimeSceneDocument(scene: SceneDocument): SceneDocument {
  return {
    schemaVersion: scene.schemaVersion,
    entities: scene.entities.map((entity) => ({
      ...entity,
      points: entity.points.map((point) => ({ ...point })),
    })),
    constraints: scene.constraints.map((constraint) => ({
      ...constraint,
    })),
    forceSources: scene.forceSources.map((source) => ({
      ...source,
    })),
    analyzers: scene.analyzers.map((analyzer) => ({
      ...analyzer,
    })),
    annotations: scene.annotations.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}
