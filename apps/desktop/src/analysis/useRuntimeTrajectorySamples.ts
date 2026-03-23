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

function hasTrajectoryAnalyzer(
  snapshot: RuntimeBridgePortSnapshot,
  analyzerId: string,
): boolean {
  return snapshot.lastCompileRequest?.scene.analyzers.some((candidate) => candidate.id === analyzerId) ?? false;
}

function createEmptyRuntimeState(
  snapshot: RuntimeBridgePortSnapshot,
  analyzerId: string,
  statusOverride?: RuntimeTrajectorySamplesStatus,
): RuntimeTrajectorySamplesState {
  return {
    trajectorySamples: [],
    status: statusOverride ?? (hasTrajectoryAnalyzer(snapshot, analyzerId) ? "loading" : "idle"),
    error: null,
    ...readTrajectoryRuntimeContext(snapshot, analyzerId),
  };
}

function shouldKeepExistingSamplesOnReadError(
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
    let lastFrameNumber: number | null = null;
    let lastCompileRequest = runtimePort.getSnapshot().lastCompileRequest;

    async function loadTrajectorySamples(snapshot: RuntimeBridgePortSnapshot) {
      const nextRequestId = requestId + 1;
      requestId = nextRequestId;
      const runtimeContext = readTrajectoryRuntimeContext(snapshot, analyzerId);

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

        if (shouldKeepExistingSamplesOnReadError(error, runtimePort.getSnapshot())) {
          setState({
            ...createEmptyRuntimeState(runtimePort.getSnapshot(), analyzerId),
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

    function handleSnapshot(snapshot: RuntimeBridgePortSnapshot) {
      const nextFrameNumber = snapshot.bridge.currentFrame?.frameNumber ?? null;

      if (nextFrameNumber === null) {
        const shouldReturnToIdle =
          snapshot.bridge.status === "idle" &&
          lastFrameNumber !== null &&
          snapshot.lastCompileRequest === lastCompileRequest;
        lastFrameNumber = null;
        lastCompileRequest = snapshot.lastCompileRequest;
        setState(
          createEmptyRuntimeState(snapshot, analyzerId, shouldReturnToIdle ? "idle" : undefined),
        );
        return;
      }

      const shouldRefresh = nextFrameNumber !== lastFrameNumber;
      lastFrameNumber = nextFrameNumber;
      lastCompileRequest = snapshot.lastCompileRequest;

      if (!shouldRefresh) {
        setState((currentState) => ({
          ...currentState,
          ...readTrajectoryRuntimeContext(snapshot, analyzerId),
        }));
        return;
      }

      void loadTrajectorySamples(snapshot);
    }

    const unsubscribe = runtimePort.subscribe(handleSnapshot);
    handleSnapshot(runtimePort.getSnapshot());

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [options.analyzerId, options.runtimePort]);

  return state;
}
