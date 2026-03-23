import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createEmptySceneDocument } from "../../../../packages/scene-schema/src";
import {
  createCompileRequestFromScene,
  createInitialRuntimeBridgePortSnapshot,
  createMockRuntimeBridgePort,
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
  type RuntimeTrajectorySample,
} from "../state/runtimeBridge";
import { useRuntimeTrajectorySamples } from "./useRuntimeTrajectorySamples";

afterEach(() => {
  cleanup();
});

function RuntimeTrajectoryProbe(props: {
  runtimePort?: RuntimeBridgePort;
  analyzerId?: string;
}) {
  const { error, status, trajectorySamples } = useRuntimeTrajectorySamples(props);

  return (
    <div>
      <span data-testid="trajectory-status">{status}</span>
      <span data-testid="trajectory-count">{trajectorySamples.length}</span>
      <span data-testid="trajectory-error">{error ?? ""}</span>
    </div>
  );
}

function createControlledRuntimePort(input?: {
  initialSnapshot?: RuntimeBridgePortSnapshot;
  initialSamples?: RuntimeTrajectorySample[];
}) {
  let snapshot = input?.initialSnapshot ?? createInitialRuntimeBridgePortSnapshot();
  let samples = input?.initialSamples;
  let readCalls = 0;
  const listeners = new Set<(snapshot: RuntimeBridgePortSnapshot) => void>();

  const port: RuntimeBridgePort = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    compile: async () => snapshot,
    start: async () => snapshot,
    pause: async () => snapshot,
    step: async () => snapshot,
    reset: async () => snapshot,
    setTimeScale: async () => snapshot,
    readTrajectorySamples: async () => {
      readCalls += 1;

      if (!samples) {
        throw new Error("unknown analyzer: traj-1");
      }

      return samples.map((sample) => ({
        frameNumber: sample.frameNumber,
        timeSeconds: sample.timeSeconds,
        position: { ...sample.position },
        velocity: { ...sample.velocity },
        acceleration: { ...sample.acceleration },
      }));
    },
  };

  return {
    port,
    emit(nextSnapshot: RuntimeBridgePortSnapshot) {
      snapshot = nextSnapshot;
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    setSamples(nextSamples?: RuntimeTrajectorySample[]) {
      samples = nextSamples;
    },
    readCallCount() {
      return readCalls;
    },
  };
}

describe("useRuntimeTrajectorySamples", () => {
  it("stays idle when no runtime source is provided", () => {
    render(<RuntimeTrajectoryProbe />);

    expect(screen.getByTestId("trajectory-status").textContent).toBe("idle");
    expect(screen.getByTestId("trajectory-count").textContent).toBe("0");
    expect(screen.getByTestId("trajectory-error").textContent).toBe("");
  });

  it("subscribes to runtime port updates and loads analyzer samples", async () => {
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) => ({
        frameNumber: nextFrameNumber,
        entities: [
          {
            entityId: "probe-1",
            position: { x: nextFrameNumber, y: 2 },
            rotation: 0,
            velocity: { x: 1.5, y: -0.5 * nextFrameNumber },
            acceleration: { x: 0, y: -9.81 },
          },
        ],
      }),
      createTrajectorySamples: ({ bridge, currentSamplesByAnalyzer }) => ({
        "traj-1": [
          ...(currentSamplesByAnalyzer["traj-1"] ?? []),
          {
            frameNumber: bridge.currentFrame?.frameNumber ?? 0,
            timeSeconds: bridge.currentTimeSeconds,
            position: {
              x: bridge.currentFrame?.entities[0]?.transform.x ?? 0,
              y: bridge.currentFrame?.entities[0]?.transform.y ?? 0,
            },
            velocity: bridge.currentFrame?.entities[0]?.velocity ?? { x: 0, y: 0 },
            acceleration: bridge.currentFrame?.entities[0]?.acceleration ?? { x: 0, y: 0 },
          },
        ],
      }),
    });
    const request = createCompileRequestFromScene(createEmptySceneDocument(), ["analysis"]);

    render(<RuntimeTrajectoryProbe runtimePort={port} analyzerId="traj-1" />);

    await port.compile(request);
    await port.step();
    await port.step();

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-status").textContent).toBe("ready");
      expect(screen.getByTestId("trajectory-count").textContent).toBe("2");
      expect(screen.getByTestId("trajectory-error").textContent).toBe("");
    });
  });

  it("refreshes samples when runtime frame updates while running", async () => {
    const snapshot = createInitialRuntimeBridgePortSnapshot();
    snapshot.bridge.status = "running";
    snapshot.bridge.currentFrame = {
      frameNumber: 1,
      entities: [],
    };
    snapshot.lastCompileRequest = {
      scene: {
        ...createEmptySceneDocument(),
        analyzers: [{ id: "traj-1", kind: "trajectory", entityId: "probe-1" }],
      },
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
    };
    const controlledPort = createControlledRuntimePort({
      initialSnapshot: snapshot,
      initialSamples: [
        {
          frameNumber: 1,
          timeSeconds: 0.1,
          position: { x: 1, y: 2 },
          velocity: { x: 2, y: 0 },
          acceleration: { x: 0, y: -9.81 },
        },
      ],
    });

    render(<RuntimeTrajectoryProbe runtimePort={controlledPort.port} analyzerId="traj-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-count").textContent).toBe("1");
      expect(controlledPort.readCallCount()).toBe(1);
    });

    controlledPort.setSamples([
      {
        frameNumber: 1,
        timeSeconds: 0.1,
        position: { x: 1, y: 2 },
        velocity: { x: 2, y: 0 },
        acceleration: { x: 0, y: -9.81 },
      },
      {
        frameNumber: 2,
        timeSeconds: 0.2,
        position: { x: 2, y: 2 },
        velocity: { x: 2.5, y: 0 },
        acceleration: { x: 0, y: -9.81 },
      },
    ]);

    await act(async () => {
      controlledPort.emit({
        ...snapshot,
        bridge: {
          ...snapshot.bridge,
          currentFrame: {
            frameNumber: 2,
            entities: [],
          },
          currentTimeSeconds: 0.2,
          status: "running",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-count").textContent).toBe("2");
      expect(controlledPort.readCallCount()).toBe(2);
    });
  });

  it("re-reads samples after a fresh step result", async () => {
    const snapshot = createInitialRuntimeBridgePortSnapshot();
    snapshot.bridge.status = "paused";
    snapshot.bridge.currentFrame = {
      frameNumber: 3,
      entities: [],
    };
    snapshot.lastCompileRequest = {
      scene: {
        ...createEmptySceneDocument(),
        analyzers: [{ id: "traj-1", kind: "trajectory", entityId: "probe-1" }],
      },
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
    };
    const controlledPort = createControlledRuntimePort({
      initialSnapshot: snapshot,
      initialSamples: [
        {
          frameNumber: 3,
          timeSeconds: 0.3,
          position: { x: 3, y: 2 },
          velocity: { x: 2, y: 0 },
          acceleration: { x: 0, y: -9.81 },
        },
      ],
    });

    render(<RuntimeTrajectoryProbe runtimePort={controlledPort.port} analyzerId="traj-1" />);

    await waitFor(() => {
      expect(controlledPort.readCallCount()).toBe(1);
    });

    controlledPort.setSamples([
      {
        frameNumber: 3,
        timeSeconds: 0.3,
        position: { x: 3, y: 2 },
        velocity: { x: 2, y: 0 },
        acceleration: { x: 0, y: -9.81 },
      },
      {
        frameNumber: 4,
        timeSeconds: 0.32,
        position: { x: 3.5, y: 2 },
        velocity: { x: 2.5, y: 0 },
        acceleration: { x: 0, y: -9.81 },
      },
    ]);

    await act(async () => {
      controlledPort.emit({
        ...snapshot,
        bridge: {
          ...snapshot.bridge,
          currentFrame: {
            frameNumber: 4,
            entities: [],
          },
          currentTimeSeconds: 0.32,
          status: "paused",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-count").textContent).toBe("2");
      expect(controlledPort.readCallCount()).toBe(2);
    });
  });

  it("clears live sample state cleanly after reset", async () => {
    const snapshot = createInitialRuntimeBridgePortSnapshot();
    snapshot.bridge.status = "paused";
    snapshot.bridge.currentFrame = {
      frameNumber: 5,
      entities: [],
    };
    snapshot.lastCompileRequest = {
      scene: {
        ...createEmptySceneDocument(),
        analyzers: [{ id: "traj-1", kind: "trajectory", entityId: "probe-1" }],
      },
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
    };
    const controlledPort = createControlledRuntimePort({
      initialSnapshot: snapshot,
      initialSamples: [
        {
          frameNumber: 5,
          timeSeconds: 0.5,
          position: { x: 4, y: 2 },
          velocity: { x: 2, y: 0 },
          acceleration: { x: 0, y: -9.81 },
        },
      ],
    });

    render(<RuntimeTrajectoryProbe runtimePort={controlledPort.port} analyzerId="traj-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-count").textContent).toBe("1");
    });

    controlledPort.setSamples(undefined);

    await act(async () => {
      controlledPort.emit({
        ...snapshot,
        bridge: {
          ...snapshot.bridge,
          currentFrame: null,
          currentTimeSeconds: 0,
          status: "idle",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-status").textContent).toBe("idle");
      expect(screen.getByTestId("trajectory-count").textContent).toBe("0");
      expect(screen.getByTestId("trajectory-error").textContent).toBe("");
    });
  });

  it("avoids duplicate reads when playback has already stopped on the same frame", async () => {
    const snapshot = createInitialRuntimeBridgePortSnapshot();
    snapshot.bridge.status = "paused";
    snapshot.bridge.currentFrame = {
      frameNumber: 7,
      entities: [],
    };
    snapshot.lastCompileRequest = {
      scene: {
        ...createEmptySceneDocument(),
        analyzers: [{ id: "traj-1", kind: "trajectory", entityId: "probe-1" }],
      },
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
    };
    const controlledPort = createControlledRuntimePort({
      initialSnapshot: snapshot,
      initialSamples: [
        {
          frameNumber: 7,
          timeSeconds: 0.7,
          position: { x: 7, y: 2 },
          velocity: { x: 2, y: 0 },
          acceleration: { x: 0, y: -9.81 },
        },
      ],
    });

    render(<RuntimeTrajectoryProbe runtimePort={controlledPort.port} analyzerId="traj-1" />);

    await waitFor(() => {
      expect(controlledPort.readCallCount()).toBe(1);
    });

    await act(async () => {
      controlledPort.emit(snapshot);
      controlledPort.emit(snapshot);
    });

    await waitFor(() => {
      expect(controlledPort.readCallCount()).toBe(1);
    });
  });
});
