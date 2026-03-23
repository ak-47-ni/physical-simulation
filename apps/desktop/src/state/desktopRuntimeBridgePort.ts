import {
  applyRuntimeBridgeStatusSnapshot,
  createInitialRuntimeBridgePortSnapshot,
  readRuntimeBridgeErrorMessage,
  setRuntimeBridgeBlockedAction,
  setRuntimeBridgeErrorMessage,
  type RuntimePlaybackConfig,
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
  type RuntimeBridgeCommandAction,
  type RuntimeBridgeStatusSnapshot,
  type RuntimeTrajectorySample,
} from "./runtimeBridge";

export type RuntimeBridgeInvoke = <T>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<T>;

type DesktopRuntimeBridgePortOptions = {
  fallbackPort: RuntimeBridgePort;
  invoke?: RuntimeBridgeInvoke | null;
};

type TauriInternals = {
  __TAURI_INTERNALS__?: {
    invoke?: RuntimeBridgeInvoke;
  };
};

export function createDesktopRuntimeBridgePort(
  options: DesktopRuntimeBridgePortOptions,
): RuntimeBridgePort {
  const runtimeInvoke = options.invoke ?? resolveTauriInvoke();

  if (!runtimeInvoke) {
    return options.fallbackPort;
  }

  const invoke: RuntimeBridgeInvoke = runtimeInvoke;
  let snapshot = createInitialRuntimeBridgePortSnapshot();
  const listeners = new Set<(snapshot: RuntimeBridgePortSnapshot) => void>();

  function publish(nextSnapshot: RuntimeBridgePortSnapshot) {
    snapshot = nextSnapshot;

    for (const listener of listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  function publishCommandFailure(
    action: RuntimeBridgeCommandAction,
    error: unknown,
  ): never {
    const message = readRuntimeBridgeErrorMessage(error);
    const currentSnapshot = snapshot;
    const nextBridge =
      action === "start" && currentSnapshot.bridge.rebuildRequired
        ? setRuntimeBridgeBlockedAction(currentSnapshot.bridge, action, message)
        : setRuntimeBridgeErrorMessage(currentSnapshot.bridge, message);

    publish({
      ...currentSnapshot,
      bridge: nextBridge,
    });

    throw (error instanceof Error ? error : new Error(message));
  }

  async function runStatusCommand(
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<RuntimeBridgePortSnapshot> {
    let status: RuntimeBridgeStatusSnapshot;

    try {
      status = await invoke<RuntimeBridgeStatusSnapshot>(command, payload);
    } catch (error) {
      return publishCommandFailure(readRuntimeCommandAction(command), error);
    }

    const currentSnapshot = snapshot;

    return publish({
      ...currentSnapshot,
      bridge: applyRuntimeBridgeStatusSnapshot(currentSnapshot.bridge, status),
    });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    compile: async (request) => {
      let status: RuntimeBridgeStatusSnapshot;

      try {
        status = await invoke<RuntimeBridgeStatusSnapshot>("compile_scene", { request });
      } catch (error) {
        return publishCommandFailure("compile", error);
      }

      const currentSnapshot = snapshot;

      return publish({
        ...currentSnapshot,
        bridge: applyRuntimeBridgeStatusSnapshot(currentSnapshot.bridge, status),
        lastCompileRequest: request,
      });
    },
    start: async () => runStatusCommand("start_runtime"),
    pause: async () => runStatusCommand("pause_runtime"),
    tick: async () => runStatusCommand("tick_runtime"),
    step: async () => runStatusCommand("step_runtime"),
    reset: async () => runStatusCommand("reset_runtime"),
    setTimeScale: async (timeScale) =>
      runStatusCommand("set_runtime_time_scale", { timeScale }),
    setPlaybackConfig: async (config: RuntimePlaybackConfig) =>
      runStatusCommand("set_runtime_playback_config", { config }),
    seek: async (timeSeconds) => runStatusCommand("seek_runtime", { timeSeconds }),
    readTrajectorySamples: async (analyzerId) =>
      invoke<RuntimeTrajectorySample[]>("read_trajectory_samples", { analyzerId }),
  };
}

function readRuntimeCommandAction(command: string): RuntimeBridgeCommandAction {
  switch (command) {
    case "start_runtime":
      return "start";
    case "pause_runtime":
      return "pause";
    case "tick_runtime":
      return "tick";
    case "step_runtime":
      return "step";
    case "reset_runtime":
      return "reset";
    case "set_runtime_time_scale":
      return "set-time-scale";
    case "set_runtime_playback_config":
      return "set-playback-config";
    case "seek_runtime":
      return "seek";
    default:
      return "set-time-scale";
  }
}

function resolveTauriInvoke(): RuntimeBridgeInvoke | null {
  const candidate = globalThis as TauriInternals;

  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function"
    ? candidate.__TAURI_INTERNALS__.invoke
    : null;
}
