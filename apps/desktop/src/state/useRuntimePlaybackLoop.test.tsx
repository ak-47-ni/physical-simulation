import { act, render } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import {
  createInitialRuntimeBridgePortSnapshot,
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
  type RuntimePlaybackConfig,
} from "./runtimeBridge";
import { useRuntimePlaybackLoop } from "./useRuntimePlaybackLoop";

type FrameScheduler = ReturnType<typeof createFrameScheduler>;
type ControlledRuntimePort = ReturnType<typeof createControlledRuntimePort>;

function createFrameScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  return {
    scheduleFrame(callback: FrameRequestCallback) {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame(handle: number) {
      callbacks.delete(handle);
    },
    pendingCount() {
      return callbacks.size;
    },
    async flushNextFrame(time = 16) {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;

      if (!next) {
        return false;
      }

      const [handle, callback] = next;
      callbacks.delete(handle);

      await act(async () => {
        callback(time);
        await Promise.resolve();
      });

      return true;
    },
  };
}

function createControlledRuntimePort(options: { deferredTicks?: boolean } = {}) {
  let snapshot = createInitialRuntimeBridgePortSnapshot();
  let tickCalls = 0;
  const listeners = new Set<(nextSnapshot: RuntimeBridgePortSnapshot) => void>();
  const pendingTickResolvers: Array<() => void> = [];

  function publish(nextSnapshot: RuntimeBridgePortSnapshot) {
    snapshot = nextSnapshot;

    for (const listener of listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  function updateBridge(
    updater: (
      currentSnapshot: RuntimeBridgePortSnapshot,
    ) => RuntimeBridgePortSnapshot["bridge"],
  ): RuntimeBridgePortSnapshot {
    return publish({
      ...snapshot,
      bridge: updater(snapshot),
    });
  }

  function createFrameForTime(timeSeconds: number) {
    return {
      frameNumber: Math.round(timeSeconds * 60),
      entities: [],
    };
  }

  function createRuntimeTotalDuration(config: RuntimePlaybackConfig): number {
    return config.mode === "precomputed"
      ? config.precomputeDurationSeconds ?? DEFAULT_PRECOMPUTED_DURATION_SECONDS
      : snapshot.bridge.totalDurationSeconds;
  }

  function buildNextTickSnapshot() {
    if (snapshot.bridge.status === "preparing") {
      const nextProgress = Math.min(1, (snapshot.bridge.preparingProgress ?? 0) + 0.25);

      if (nextProgress >= 1) {
        return {
          ...snapshot,
          bridge: {
            ...snapshot.bridge,
            status: "running",
            preparingProgress: null,
            canSeek: true,
          },
        };
      }

      return {
        ...snapshot,
        bridge: {
          ...snapshot.bridge,
          status: "preparing",
          preparingProgress: nextProgress,
          canSeek: false,
        },
      };
    }

    const nextTimeSeconds = Math.min(
      snapshot.bridge.currentTimeSeconds + 1 / 60,
      snapshot.bridge.totalDurationSeconds,
    );
    const reachedTerminalFrame = nextTimeSeconds >= snapshot.bridge.totalDurationSeconds;

    return {
      ...snapshot,
      bridge: {
        ...snapshot.bridge,
        status: reachedTerminalFrame ? "paused" : "running",
        currentTimeSeconds: nextTimeSeconds,
        currentFrame: createFrameForTime(nextTimeSeconds),
      },
    };
  }

  const port: RuntimeBridgePort = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    compile: async (request) =>
      publish({
        ...snapshot,
        lastCompileRequest: request,
      }),
    start: async () =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        status:
          currentSnapshot.bridge.playbackMode === "precomputed" &&
          !currentSnapshot.bridge.canSeek
            ? "preparing"
            : "running",
        preparingProgress:
          currentSnapshot.bridge.playbackMode === "precomputed" &&
          !currentSnapshot.bridge.canSeek
            ? 0
            : currentSnapshot.bridge.preparingProgress,
        rebuildRequired: false,
        canResume: true,
        blockReason: null,
      })),
    pause: async () =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        status: "paused",
      })),
    tick: async () => {
      tickCalls += 1;

      if (!options.deferredTicks) {
        return publish(buildNextTickSnapshot());
      }

      return await new Promise<RuntimeBridgePortSnapshot>((resolve) => {
        pendingTickResolvers.push(() => {
          resolve(publish(buildNextTickSnapshot()));
        });
      });
    },
    step: async () => publish(buildNextTickSnapshot()),
    reset: async () =>
      publish({
        ...createInitialRuntimeBridgePortSnapshot(),
        bridge: {
          ...createInitialRuntimeBridgePortSnapshot().bridge,
          playbackMode: snapshot.bridge.playbackMode,
          totalDurationSeconds: snapshot.bridge.totalDurationSeconds,
          canSeek:
            snapshot.bridge.playbackMode === "precomputed"
              ? snapshot.bridge.canSeek
              : false,
        },
        lastCompileRequest: snapshot.lastCompileRequest,
      }),
    setTimeScale: async (timeScale) =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        timeScale,
      })),
    setPlaybackConfig: async (config) =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        status: "idle",
        currentTimeSeconds: 0,
        currentFrame: null,
        playbackMode: config.mode,
        totalDurationSeconds: createRuntimeTotalDuration(config),
        preparingProgress: null,
        canSeek: false,
      })),
    seek: async (timeSeconds) =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        status: "paused",
        currentTimeSeconds: timeSeconds,
        currentFrame: createFrameForTime(timeSeconds),
      })),
    readTrajectorySamples: async () => [],
  };

  return {
    port,
    getTickCalls: () => tickCalls,
    publishBridge(
      update: (
        bridge: RuntimeBridgePortSnapshot["bridge"],
      ) => RuntimeBridgePortSnapshot["bridge"],
    ) {
      publish({
        ...snapshot,
        bridge: update(snapshot.bridge),
      });
    },
    async resolveNextTick() {
      const resolve = pendingTickResolvers.shift();
      expect(resolve).toBeTypeOf("function");

      await act(async () => {
        resolve?.();
        await Promise.resolve();
      });
    },
  };
}

function RuntimePlaybackHarness(props: {
  runtimePort: RuntimeBridgePort;
  scheduler: FrameScheduler;
}) {
  const [snapshot, setSnapshot] = useState(() => props.runtimePort.getSnapshot());

  useEffect(() => props.runtimePort.subscribe(setSnapshot), [props.runtimePort]);

  useRuntimePlaybackLoop({
    runtimePort: props.runtimePort,
    snapshot,
    scheduleFrame: props.scheduler.scheduleFrame,
    cancelFrame: props.scheduler.cancelFrame,
  });

  return null;
}

describe("useRuntimePlaybackLoop", () => {
  it("continues scheduling while precompute cache generation is in progress", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    await act(async () => {
      await control.port.setPlaybackConfig({
        mode: "precomputed",
        precomputeDurationSeconds: 10,
      });
      await control.port.start();
    });

    expect(control.port.getSnapshot().bridge.status).toBe("preparing");
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();

    expect(control.getTickCalls()).toBe(1);
    expect(control.port.getSnapshot().bridge.status).toBe("preparing");
    expect(control.port.getSnapshot().bridge.preparingProgress).toBe(0.25);
    expect(scheduler.pendingCount()).toBe(1);
  });

  it("schedules repeated tick calls while the runtime is running", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    await act(async () => {
      await control.port.start();
    });

    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(1);
    expect(control.port.getSnapshot().bridge.currentFrame?.frameNumber).toBe(1);
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(2);
    expect(control.port.getSnapshot().bridge.currentFrame?.frameNumber).toBe(2);
  });

  it("stops scheduling while playback is idle, paused, reset, or unmounted", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    const view = render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    expect(scheduler.pendingCount()).toBe(0);

    await act(async () => {
      await control.port.start();
    });
    expect(scheduler.pendingCount()).toBe(1);

    await act(async () => {
      await control.port.pause();
    });
    expect(scheduler.pendingCount()).toBe(0);

    await act(async () => {
      await control.port.start();
    });
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(1);

    await act(async () => {
      await control.port.reset();
    });
    expect(scheduler.pendingCount()).toBe(0);

    await act(async () => {
      await control.port.start();
    });
    expect(scheduler.pendingCount()).toBe(1);

    view.unmount();
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("never overlaps concurrent tick requests", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort({ deferredTicks: true });

    render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    await act(async () => {
      await control.port.start();
    });
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);

    await act(async () => {
      control.publishBridge((bridge) => ({
        ...bridge,
      }));
    });
    expect(scheduler.pendingCount()).toBe(0);

    await control.resolveNextTick();
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(2);
  });

  it("ignores playback while the runtime requires a rebuild", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    await act(async () => {
      await control.port.start();
    });
    expect(scheduler.pendingCount()).toBe(1);

    await act(async () => {
      control.publishBridge((bridge) => ({
        ...bridge,
        status: "paused",
        rebuildRequired: true,
        canResume: false,
        blockReason: "rebuild-required",
      }));
    });

    expect(scheduler.pendingCount()).toBe(0);

    await scheduler.flushNextFrame();
    expect(control.getTickCalls()).toBe(0);
  });

  it("stops scheduling after realtime playback reaches the capped terminal state", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

    await act(async () => {
      control.publishBridge((bridge) => ({
        ...bridge,
        totalDurationSeconds: 1 / 60,
      }));
      await control.port.start();
    });

    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.flushNextFrame();

    expect(control.getTickCalls()).toBe(1);
    expect(control.port.getSnapshot().bridge.status).toBe("paused");
    expect(control.port.getSnapshot().bridge.currentTimeSeconds).toBeCloseTo(1 / 60, 5);
    expect(scheduler.pendingCount()).toBe(0);
  });
});
