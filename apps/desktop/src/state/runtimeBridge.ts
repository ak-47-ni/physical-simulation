import {
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type RuntimeFramePayload,
  type SceneDocument,
  type Vector2,
} from "../../../../packages/scene-schema/src";

export type RuntimeCompileRequest = {
  scene: SceneDocument;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
};

export type RuntimeBridgeStatus = "idle" | "running" | "paused";
export type RuntimeBridgeBlockReason = "rebuild-required" | null;

export type RuntimeFrameEntityView = {
  id: string;
  transform: {
    x: number;
    y: number;
    rotation: number;
  };
  velocity?: Vector2;
  acceleration?: Vector2;
};

export type RuntimeFrameView = {
  frameNumber: number;
  entities: RuntimeFrameEntityView[];
};

export type RuntimeBridgeState = {
  status: RuntimeBridgeStatus;
  currentFrame: RuntimeFrameView | null;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
};

export function createInitialRuntimeBridgeState(): RuntimeBridgeState {
  return {
    status: "idle",
    currentFrame: null,
    dirtyScopes: [],
    rebuildRequired: false,
    canResume: true,
    blockReason: null,
  };
}

export function createCompileRequestFromScene(
  scene: SceneDocument,
  dirtyScopes: DirtyEditScope[] = [],
): RuntimeCompileRequest {
  return {
    scene: cloneSceneDocument(scene),
    dirtyScopes: [...dirtyScopes],
    rebuildRequired: requiresRuntimeRebuild(dirtyScopes),
  };
}

export function applyRuntimeFrame(
  state: RuntimeBridgeState,
  frame: RuntimeFramePayload,
): RuntimeBridgeState {
  return {
    ...state,
    currentFrame: {
      frameNumber: frame.frameNumber,
      entities: frame.entities.map((entity) => ({
        id: entity.entityId,
        transform: {
          x: entity.position.x,
          y: entity.position.y,
          rotation: entity.rotation,
        },
        velocity: entity.velocity ? { ...entity.velocity } : undefined,
        acceleration: entity.acceleration ? { ...entity.acceleration } : undefined,
      })),
    },
  };
}

export function markRuntimeBridgeSceneDirty(
  state: RuntimeBridgeState,
  scopes: DirtyEditScope[],
): RuntimeBridgeState {
  const dirtyScopes = Array.from(new Set([...state.dirtyScopes, ...scopes]));
  const rebuildRequired = requiresRuntimeRebuild(dirtyScopes);

  return {
    ...state,
    dirtyScopes,
    rebuildRequired,
    canResume: !rebuildRequired,
    blockReason: rebuildRequired ? "rebuild-required" : null,
  };
}

export function markRuntimeBridgeRebuilt(state: RuntimeBridgeState): RuntimeBridgeState {
  return {
    ...state,
    dirtyScopes: [],
    rebuildRequired: false,
    canResume: true,
    blockReason: null,
  };
}

export function resumeRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  if (state.rebuildRequired) {
    return {
      ...state,
      status: "paused",
      canResume: false,
      blockReason: "rebuild-required",
    };
  }

  return {
    ...state,
    status: "running",
    canResume: true,
    blockReason: null,
  };
}

export function pauseRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  return {
    ...state,
    status: "paused",
  };
}

function cloneSceneDocument(scene: SceneDocument): SceneDocument {
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
