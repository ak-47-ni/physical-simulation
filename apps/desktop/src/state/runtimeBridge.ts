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
  currentTimeSeconds: number;
  timeScale: number;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
};

export type RuntimeBridgePortSnapshot = {
  bridge: RuntimeBridgeState;
  lastCompileRequest: RuntimeCompileRequest | null;
};

export type RuntimeBridgePort = {
  getSnapshot: () => RuntimeBridgePortSnapshot;
  subscribe: (listener: (snapshot: RuntimeBridgePortSnapshot) => void) => () => void;
  compile: (request: RuntimeCompileRequest) => Promise<RuntimeBridgePortSnapshot>;
  start: () => Promise<RuntimeBridgePortSnapshot>;
  pause: () => Promise<RuntimeBridgePortSnapshot>;
  step: () => Promise<RuntimeBridgePortSnapshot>;
  reset: () => Promise<RuntimeBridgePortSnapshot>;
  setTimeScale: (timeScale: number) => Promise<RuntimeBridgePortSnapshot>;
};

export type CreateMockRuntimeBridgePortOptions = {
  createFrame?: (
    input: RuntimeBridgePortSnapshot & { nextFrameNumber: number },
  ) => RuntimeFramePayload | null;
};

export function createInitialRuntimeBridgeState(): RuntimeBridgeState {
  return {
    status: "idle",
    currentFrame: null,
    currentTimeSeconds: 0,
    timeScale: 1,
    dirtyScopes: [],
    rebuildRequired: false,
    canResume: true,
    blockReason: null,
  };
}

export function createInitialRuntimeBridgePortSnapshot(): RuntimeBridgePortSnapshot {
  return {
    bridge: createInitialRuntimeBridgeState(),
    lastCompileRequest: null,
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

export function setRuntimeBridgeTimeScale(
  state: RuntimeBridgeState,
  timeScale: number,
): RuntimeBridgeState {
  return {
    ...state,
    timeScale,
  };
}

export function stepRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  return {
    ...state,
    currentTimeSeconds: state.currentTimeSeconds + (1 / 60) * state.timeScale,
  };
}

export function resetRuntimeBridge(_state: RuntimeBridgeState): RuntimeBridgeState {
  return createInitialRuntimeBridgeState();
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

export function createMockRuntimeBridgePort(
  options: CreateMockRuntimeBridgePortOptions = {},
): RuntimeBridgePort {
  let snapshot = createInitialRuntimeBridgePortSnapshot();
  const listeners = new Set<(nextSnapshot: RuntimeBridgePortSnapshot) => void>();

  function publish(nextSnapshot: RuntimeBridgePortSnapshot) {
    snapshot = nextSnapshot;

    for (const listener of listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  function update(
    updater: (currentSnapshot: RuntimeBridgePortSnapshot) => RuntimeBridgePortSnapshot,
  ) {
    return publish(updater(snapshot));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    compile: async (request) =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: {
          ...createInitialRuntimeBridgeState(),
          timeScale: currentSnapshot.bridge.timeScale,
        },
        lastCompileRequest: request,
      })),
    start: async () =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: resumeRuntimeBridge(currentSnapshot.bridge),
      })),
    pause: async () =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: pauseRuntimeBridge(currentSnapshot.bridge),
      })),
    step: async () =>
      update((currentSnapshot) => {
        let bridge = stepRuntimeBridge(currentSnapshot.bridge);
        const nextFrameNumber = (bridge.currentFrame?.frameNumber ?? 0) + 1;
        const frame =
          options.createFrame?.({
            ...currentSnapshot,
            bridge,
            nextFrameNumber,
          }) ??
          {
            frameNumber: nextFrameNumber,
            entities: [],
          };

        bridge = applyRuntimeFrame(bridge, frame);

        return {
          ...currentSnapshot,
          bridge,
        };
      }),
    reset: async () =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: resetRuntimeBridge(currentSnapshot.bridge),
      })),
    setTimeScale: async (timeScale) =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: setRuntimeBridgeTimeScale(currentSnapshot.bridge, timeScale),
      })),
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
