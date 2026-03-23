import {
  requiresRuntimeRebuild,
  type DirtyEditScope,
  type RuntimeFramePayload,
  type SceneDocument,
  type Vector2,
} from "../../../../packages/scene-schema/src";
import {
  createRuntimeCompileRequest,
  type RuntimeCompileRequest,
} from "./runtimeCompileRequest";

export type RuntimeBridgeStatus = "idle" | "preparing" | "running" | "paused";
export type RuntimeBridgeBlockReason = "rebuild-required" | null;
export type RuntimePlaybackMode = "realtime" | "precomputed";
export type RuntimePlaybackConfig = {
  mode: RuntimePlaybackMode;
  precomputeDurationSeconds?: number;
};
export type RuntimeBridgeCommandAction =
  | "compile"
  | "start"
  | "pause"
  | "tick"
  | "step"
  | "reset"
  | "set-time-scale"
  | "set-playback-config"
  | "seek";

export const DEFAULT_REALTIME_DURATION_CAP_SECONDS = 40;
export const DEFAULT_PRECOMPUTED_DURATION_SECONDS = 20;
const RUNTIME_STEP_SECONDS = 1 / 60;
const MOCK_PRECOMPUTE_PROGRESS_INCREMENT = 0.25;

export type RuntimeBridgeBlockedAction = {
  action: RuntimeBridgeCommandAction;
  message: string;
};

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

export type RuntimeTrajectorySample = {
  frameNumber: number;
  timeSeconds: number;
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
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
  playbackMode: RuntimePlaybackMode;
  totalDurationSeconds: number;
  preparingProgress: number | null;
  canSeek: boolean;
  lastErrorMessage: string | null;
  lastBlockedAction: RuntimeBridgeBlockedAction | null;
};

export type RuntimeBridgeStatusSnapshot = {
  status: RuntimeBridgeState["status"];
  currentFrame: RuntimeFramePayload | null;
  currentTimeSeconds: number;
  timeScale: number;
  dirtyScopes: DirtyEditScope[];
  rebuildRequired: boolean;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
  playbackMode: RuntimePlaybackMode;
  totalDurationSeconds: number;
  preparingProgress: number | null;
  canSeek: boolean;
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
  tick: () => Promise<RuntimeBridgePortSnapshot>;
  step: () => Promise<RuntimeBridgePortSnapshot>;
  reset: () => Promise<RuntimeBridgePortSnapshot>;
  setTimeScale: (timeScale: number) => Promise<RuntimeBridgePortSnapshot>;
  setPlaybackConfig: (
    config: RuntimePlaybackConfig,
  ) => Promise<RuntimeBridgePortSnapshot>;
  seek: (timeSeconds: number) => Promise<RuntimeBridgePortSnapshot>;
  readTrajectorySamples: (analyzerId: string) => Promise<RuntimeTrajectorySample[]>;
};

export type CreateMockRuntimeBridgePortOptions = {
  createFrame?: (
    input: RuntimeBridgePortSnapshot & { nextFrameNumber: number },
  ) => RuntimeFramePayload | null;
  createTrajectorySamples?: (input: {
    bridge: RuntimeBridgeState;
    frame: RuntimeFramePayload;
    currentSamplesByAnalyzer: Record<string, RuntimeTrajectorySample[]>;
  }) => Record<string, RuntimeTrajectorySample[]>;
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
    playbackMode: "realtime",
    totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    preparingProgress: null,
    canSeek: false,
    lastErrorMessage: null,
    lastBlockedAction: null,
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
  return createRuntimeCompileRequest(scene, dirtyScopes);
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

export function applyRuntimeBridgeStatusSnapshot(
  state: RuntimeBridgeState,
  snapshot: RuntimeBridgeStatusSnapshot,
): RuntimeBridgeState {
  const nextState = clearRuntimeBridgeFeedback({
    ...state,
    status: snapshot.status,
    currentTimeSeconds: snapshot.currentTimeSeconds,
    timeScale: snapshot.timeScale,
    dirtyScopes: [...snapshot.dirtyScopes],
    rebuildRequired: snapshot.rebuildRequired,
    canResume: snapshot.canResume,
    blockReason: snapshot.blockReason,
    playbackMode: snapshot.playbackMode,
    totalDurationSeconds: snapshot.totalDurationSeconds,
    preparingProgress: snapshot.preparingProgress,
    canSeek: snapshot.canSeek,
  });

  if (!snapshot.currentFrame) {
    return {
      ...nextState,
      currentFrame: null,
    };
  }

  return applyRuntimeFrame(nextState, snapshot.currentFrame);
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
    preparingProgress: null,
    canSeek: rebuildRequired ? false : state.canSeek,
  };
}

export function markRuntimeBridgeRebuilt(state: RuntimeBridgeState): RuntimeBridgeState {
  return clearRuntimeBridgeFeedback({
    ...state,
    dirtyScopes: [],
    rebuildRequired: false,
    canResume: true,
    blockReason: null,
  });
}

export function setRuntimeBridgeTimeScale(
  state: RuntimeBridgeState,
  timeScale: number,
): RuntimeBridgeState {
  return clearRuntimeBridgeFeedback({
    ...state,
    timeScale,
  });
}

export function setRuntimeBridgePlaybackConfig(
  state: RuntimeBridgeState,
  config: RuntimePlaybackConfig,
): RuntimeBridgeState {
  const totalDurationSeconds = readRuntimeTotalDurationSeconds(config);

  return clearRuntimeBridgeFeedback({
    ...createInitialRuntimeBridgeState(),
    timeScale: state.timeScale,
    dirtyScopes: [...state.dirtyScopes],
    rebuildRequired: state.rebuildRequired,
    canResume: !state.rebuildRequired,
    blockReason: state.rebuildRequired ? "rebuild-required" : null,
    playbackMode: config.mode,
    totalDurationSeconds,
  });
}

export function stepRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  const currentTimeSeconds = readNextRuntimeTimeSeconds(state);

  return clearRuntimeBridgeFeedback({
    ...state,
    currentTimeSeconds,
    status:
      state.status === "running" && currentTimeSeconds >= state.totalDurationSeconds
        ? "paused"
        : state.status,
  });
}

export function tickRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  if (state.status === "preparing") {
    const preparingProgress = Math.min(
      1,
      (state.preparingProgress ?? 0) + MOCK_PRECOMPUTE_PROGRESS_INCREMENT,
    );

    if (preparingProgress >= 1) {
      return clearRuntimeBridgeFeedback({
        ...state,
        status: "running",
        currentTimeSeconds: 0,
        preparingProgress: null,
        canSeek: true,
      });
    }

    return clearRuntimeBridgeFeedback({
      ...state,
      status: "preparing",
      preparingProgress,
      canSeek: false,
    });
  }

  if (state.status !== "running") {
    return clearRuntimeBridgeFeedback(state);
  }

  return stepRuntimeBridge(state);
}

export function resetRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  return {
    ...createInitialRuntimeBridgeState(),
    playbackMode: state.playbackMode,
    totalDurationSeconds: state.totalDurationSeconds,
    canSeek: state.playbackMode === "precomputed" ? state.canSeek : false,
  };
}

export function resumeRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  if (state.rebuildRequired) {
    return setRuntimeBridgeBlockedAction(
      {
        ...state,
        status: "paused",
        canResume: false,
        blockReason: "rebuild-required",
      },
      "start",
      "Rebuild required before starting runtime.",
    );
  }

  if (state.playbackMode === "precomputed" && !state.canSeek) {
    return clearRuntimeBridgeFeedback({
      ...state,
      status: "preparing",
      canResume: true,
      blockReason: null,
      preparingProgress: state.preparingProgress ?? 0,
    });
  }

  return clearRuntimeBridgeFeedback({
    ...state,
    status: "running",
    canResume: true,
    blockReason: null,
  });
}

export function seekRuntimeBridge(
  state: RuntimeBridgeState,
  timeSeconds: number,
): RuntimeBridgeState {
  if (!state.canSeek) {
    return setRuntimeBridgeBlockedAction(
      state,
      "seek",
      "Cached playback is not ready to seek yet.",
    );
  }

  return clearRuntimeBridgeFeedback({
    ...state,
    status: "paused",
    currentTimeSeconds: clampRuntimeTimeSeconds(timeSeconds, state.totalDurationSeconds),
  });
}

export function pauseRuntimeBridge(state: RuntimeBridgeState): RuntimeBridgeState {
  return clearRuntimeBridgeFeedback({
    ...state,
    status: "paused",
  });
}

export function clearRuntimeBridgeFeedback(state: RuntimeBridgeState): RuntimeBridgeState {
  return {
    ...state,
    lastErrorMessage: null,
    lastBlockedAction: null,
  };
}

export function setRuntimeBridgeErrorMessage(
  state: RuntimeBridgeState,
  message: string,
): RuntimeBridgeState {
  return {
    ...state,
    lastErrorMessage: message,
    lastBlockedAction: null,
  };
}

export function setRuntimeBridgeBlockedAction(
  state: RuntimeBridgeState,
  action: RuntimeBridgeCommandAction,
  message: string,
): RuntimeBridgeState {
  return {
    ...state,
    lastErrorMessage: null,
    lastBlockedAction: {
      action,
      message,
    },
  };
}

export function readRuntimeBridgeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Runtime command failed.";
}

export function createMockRuntimeBridgePort(
  options: CreateMockRuntimeBridgePortOptions = {},
): RuntimeBridgePort {
  let snapshot = createInitialRuntimeBridgePortSnapshot();
  let trajectorySamplesByAnalyzer: Record<string, RuntimeTrajectorySample[]> = {};
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
      update((currentSnapshot) => {
        trajectorySamplesByAnalyzer = {};
        const currentBridge = currentSnapshot.bridge;

        return {
          ...currentSnapshot,
          bridge: {
            ...createInitialRuntimeBridgeState(),
            timeScale: currentBridge.timeScale,
            playbackMode: currentBridge.playbackMode,
            totalDurationSeconds: currentBridge.totalDurationSeconds,
          },
          lastCompileRequest: request,
        };
      }),
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
    tick: async () =>
      update((currentSnapshot) => {
        let bridge = tickRuntimeBridge(currentSnapshot.bridge);

        if (bridge.currentTimeSeconds === currentSnapshot.bridge.currentTimeSeconds) {
          return {
            ...currentSnapshot,
            bridge,
          };
        }

        const frame = createMockRuntimeFrame(options, currentSnapshot, bridge);

        bridge = applyRuntimeFrame(bridge, frame);
        trajectorySamplesByAnalyzer = updateMockTrajectorySamples(
          options,
          bridge,
          frame,
          trajectorySamplesByAnalyzer,
        );

        return {
          ...currentSnapshot,
          bridge,
        };
      }),
    step: async () =>
      update((currentSnapshot) => {
        let bridge = stepRuntimeBridge(currentSnapshot.bridge);

        if (bridge.currentTimeSeconds > currentSnapshot.bridge.currentTimeSeconds) {
          const frame = createMockRuntimeFrame(options, currentSnapshot, bridge);

          bridge = applyRuntimeFrame(bridge, frame);
          trajectorySamplesByAnalyzer = updateMockTrajectorySamples(
            options,
            bridge,
            frame,
            trajectorySamplesByAnalyzer,
          );
        }

        return {
          ...currentSnapshot,
          bridge,
        };
      }),
    reset: async () =>
      update((currentSnapshot) => {
        trajectorySamplesByAnalyzer = {};

        return {
          ...currentSnapshot,
          bridge: resetRuntimeBridge(currentSnapshot.bridge),
        };
      }),
    setTimeScale: async (timeScale) =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: setRuntimeBridgeTimeScale(currentSnapshot.bridge, timeScale),
      })),
    setPlaybackConfig: async (config) =>
      update((currentSnapshot) => ({
        ...currentSnapshot,
        bridge: setRuntimeBridgePlaybackConfig(currentSnapshot.bridge, config),
      })),
    seek: async (timeSeconds) =>
      update((currentSnapshot) => {
        let bridge = seekRuntimeBridge(currentSnapshot.bridge, timeSeconds);

        if (bridge.currentTimeSeconds !== currentSnapshot.bridge.currentTimeSeconds) {
          bridge = applyRuntimeFrame(
            bridge,
            createMockRuntimeFrame(options, currentSnapshot, bridge),
          );
        }

        return {
          ...currentSnapshot,
          bridge,
        };
      }),
    readTrajectorySamples: async (analyzerId) => {
      const samples = trajectorySamplesByAnalyzer[analyzerId];

      if (!samples) {
        throw new Error(`unknown analyzer: ${analyzerId}`);
      }

      return cloneTrajectorySamples(samples);
    },
  };
}

function cloneTrajectorySamples(samples: RuntimeTrajectorySample[]): RuntimeTrajectorySample[] {
  return samples.map((sample) => ({
    frameNumber: sample.frameNumber,
    timeSeconds: sample.timeSeconds,
    position: { ...sample.position },
    velocity: { ...sample.velocity },
    acceleration: { ...sample.acceleration },
  }));
}

function cloneTrajectorySampleMap(
  samplesByAnalyzer: Record<string, RuntimeTrajectorySample[]>,
): Record<string, RuntimeTrajectorySample[]> {
  return Object.fromEntries(
    Object.entries(samplesByAnalyzer).map(([analyzerId, samples]) => [
      analyzerId,
      cloneTrajectorySamples(samples),
    ]),
  );
}

function createMockRuntimeFrame(
  options: CreateMockRuntimeBridgePortOptions,
  currentSnapshot: RuntimeBridgePortSnapshot,
  bridge: RuntimeBridgeState,
): RuntimeFramePayload {
  const nextFrameNumber = Math.round(bridge.currentTimeSeconds / RUNTIME_STEP_SECONDS);

  return (
    options.createFrame?.({
      ...currentSnapshot,
      bridge,
      nextFrameNumber,
    }) ?? {
      frameNumber: nextFrameNumber,
      entities: [],
    }
  );
}

function updateMockTrajectorySamples(
  options: CreateMockRuntimeBridgePortOptions,
  bridge: RuntimeBridgeState,
  frame: RuntimeFramePayload,
  currentSamplesByAnalyzer: Record<string, RuntimeTrajectorySample[]>,
): Record<string, RuntimeTrajectorySample[]> {
  return (
    options.createTrajectorySamples?.({
      bridge,
      frame,
      currentSamplesByAnalyzer: cloneTrajectorySampleMap(currentSamplesByAnalyzer),
    }) ?? currentSamplesByAnalyzer
  );
}

function readNextRuntimeTimeSeconds(state: RuntimeBridgeState): number {
  return clampRuntimeTimeSeconds(
    state.currentTimeSeconds + RUNTIME_STEP_SECONDS * state.timeScale,
    state.totalDurationSeconds,
  );
}

function clampRuntimeTimeSeconds(timeSeconds: number, totalDurationSeconds: number): number {
  return Math.max(0, Math.min(timeSeconds, totalDurationSeconds));
}

function readRuntimeTotalDurationSeconds(config: RuntimePlaybackConfig): number {
  if (config.mode === "realtime") {
    return DEFAULT_REALTIME_DURATION_CAP_SECONDS;
  }

  return normalizePrecomputeDurationSeconds(config.precomputeDurationSeconds);
}

function normalizePrecomputeDurationSeconds(duration: number | undefined): number {
  if (!Number.isFinite(duration) || duration === undefined || duration <= 0) {
    return DEFAULT_PRECOMPUTED_DURATION_SECONDS;
  }

  return duration;
}

export { createRuntimeCompileRequest } from "./runtimeCompileRequest";
export type { RuntimeCompileRequest } from "./runtimeCompileRequest";
