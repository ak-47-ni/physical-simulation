import { useEffect, useState } from "react";

import type {
  RuntimeBridgePort,
  RuntimeBridgePortSnapshot,
  RuntimeTrajectorySample,
} from "../state/runtimeBridge";

export type RuntimeTrajectorySamplesStatus = "idle" | "loading" | "ready" | "error";

type UseRuntimeTrajectorySamplesOptions = {
  runtimePort?: RuntimeBridgePort;
  analyzerId?: string;
};

type RuntimeTrajectorySamplesState = {
  trajectorySamples: RuntimeTrajectorySample[];
  status: RuntimeTrajectorySamplesStatus;
  error: string | null;
};

const IDLE_STATE: RuntimeTrajectorySamplesState = {
  trajectorySamples: [],
  status: "idle",
  error: null,
};

function shouldWaitForRuntimeSamples(
  error: unknown,
  snapshot: RuntimeBridgePortSnapshot,
): boolean {
  const message = error instanceof Error ? error.message : "";

  if (!/unknown analyzer|runtime not initialized/i.test(message)) {
    return false;
  }

  return (snapshot.bridge.currentFrame?.frameNumber ?? 0) === 0;
}

export function useRuntimeTrajectorySamples(
  options: UseRuntimeTrajectorySamplesOptions = {},
): RuntimeTrajectorySamplesState {
  const [state, setState] = useState<RuntimeTrajectorySamplesState>(IDLE_STATE);

  useEffect(() => {
    if (!options.runtimePort || !options.analyzerId) {
      setState(IDLE_STATE);
      return;
    }

    const { analyzerId, runtimePort } = options;
    let disposed = false;
    let requestId = 0;

    async function loadTrajectorySamples() {
      const nextRequestId = requestId + 1;
      requestId = nextRequestId;

      setState((currentState) => ({
        trajectorySamples: currentState.trajectorySamples,
        status: currentState.trajectorySamples.length > 0 ? currentState.status : "loading",
        error: null,
      }));

      try {
        const trajectorySamples = await runtimePort.readTrajectorySamples(analyzerId);

        if (disposed || nextRequestId !== requestId) {
          return;
        }

        setState({
          trajectorySamples,
          status: "ready",
          error: null,
        });
      } catch (error) {
        if (disposed || nextRequestId !== requestId) {
          return;
        }

        if (shouldWaitForRuntimeSamples(error, runtimePort.getSnapshot())) {
          setState({
            trajectorySamples: [],
            status: "loading",
            error: null,
          });
          return;
        }

        setState((currentState) => ({
          trajectorySamples: currentState.trajectorySamples,
          status: "error",
          error: error instanceof Error ? error.message : "failed to load runtime trajectory",
        }));
      }
    }

    const unsubscribe = runtimePort.subscribe(() => {
      void loadTrajectorySamples();
    });

    void loadTrajectorySamples();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [options.analyzerId, options.runtimePort]);

  return state;
}
