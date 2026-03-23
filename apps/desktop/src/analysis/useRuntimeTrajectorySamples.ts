import { useEffect, useState } from "react";

import type {
  RuntimeBridgeBlockReason,
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
  analyzerEntityId: string | null;
  lastErrorMessage: string | null;
  lastBlockedActionMessage: string | null;
  blockReason: RuntimeBridgeBlockReason;
};

const IDLE_STATE: RuntimeTrajectorySamplesState = {
  trajectorySamples: [],
  status: "idle",
  error: null,
  analyzerEntityId: null,
  lastErrorMessage: null,
  lastBlockedActionMessage: null,
  blockReason: null,
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

function readTrajectoryRuntimeContext(
  snapshot: RuntimeBridgePortSnapshot,
  analyzerId: string,
): Pick<
  RuntimeTrajectorySamplesState,
  "analyzerEntityId" | "lastErrorMessage" | "lastBlockedActionMessage" | "blockReason"
> {
  const analyzer =
    snapshot.lastCompileRequest?.scene.analyzers.find((candidate) => candidate.id === analyzerId) ??
    null;

  return {
    analyzerEntityId: analyzer?.entityId ?? null,
    lastErrorMessage: snapshot.bridge.lastErrorMessage,
    lastBlockedActionMessage: snapshot.bridge.lastBlockedAction?.message ?? null,
    blockReason: snapshot.bridge.blockReason,
  };
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
      const runtimeContext = readTrajectoryRuntimeContext(runtimePort.getSnapshot(), analyzerId);

      setState((currentState) => ({
        trajectorySamples: currentState.trajectorySamples,
        status: currentState.trajectorySamples.length > 0 ? currentState.status : "loading",
        error: null,
        ...runtimeContext,
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
          ...readTrajectoryRuntimeContext(runtimePort.getSnapshot(), analyzerId),
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
            ...readTrajectoryRuntimeContext(runtimePort.getSnapshot(), analyzerId),
          });
          return;
        }

        setState((currentState) => ({
          trajectorySamples: currentState.trajectorySamples,
          status: "error",
          error: error instanceof Error ? error.message : "failed to load runtime trajectory",
          ...readTrajectoryRuntimeContext(runtimePort.getSnapshot(), analyzerId),
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
