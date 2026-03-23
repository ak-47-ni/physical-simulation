import {
  applyRuntimeBridgeStatusSnapshot,
  createInitialRuntimeBridgePortSnapshot,
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
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
  const invoke = options.invoke ?? resolveTauriInvoke();

  if (!invoke) {
    return options.fallbackPort;
  }

  let snapshot = createInitialRuntimeBridgePortSnapshot();
  const listeners = new Set<(snapshot: RuntimeBridgePortSnapshot) => void>();

  function publish(nextSnapshot: RuntimeBridgePortSnapshot) {
    snapshot = nextSnapshot;

    for (const listener of listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  async function runStatusCommand(
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<RuntimeBridgePortSnapshot> {
    const status = await invoke<RuntimeBridgeStatusSnapshot>(command, payload);
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
      const status = await invoke<RuntimeBridgeStatusSnapshot>("compile_scene", { request });
      const currentSnapshot = snapshot;

      return publish({
        ...currentSnapshot,
        bridge: applyRuntimeBridgeStatusSnapshot(currentSnapshot.bridge, status),
        lastCompileRequest: request,
      });
    },
    start: async () => runStatusCommand("start_runtime"),
    pause: async () => runStatusCommand("pause_runtime"),
    step: async () => runStatusCommand("step_runtime"),
    reset: async () => runStatusCommand("reset_runtime"),
    setTimeScale: async (timeScale) =>
      runStatusCommand("set_runtime_time_scale", { timeScale }),
    readTrajectorySamples: async (analyzerId) =>
      invoke<RuntimeTrajectorySample[]>("read_trajectory_samples", { analyzerId }),
  };
}

function resolveTauriInvoke(): RuntimeBridgeInvoke | null {
  const candidate = globalThis as TauriInternals;

  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function"
    ? candidate.__TAURI_INTERNALS__.invoke
    : null;
}
