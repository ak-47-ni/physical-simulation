import { act, render } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import {
  createInitialRuntimeBridgePortSnapshot,
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
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

  function buildNextTickSnapshot() {
    return {
      ...snapshot,
      bridge: {
        ...snapshot.bridge,
        status: "running" as const,
        currentTimeSeconds: snapshot.bridge.currentTimeSeconds + 1 / 60,
        currentFrame: {
          frameNumber: (snapshot.bridge.currentFrame?.frameNumber ?? 0) + 1,
          entities: [],
        },
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
        status: "running",
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
        lastCompileRequest: snapshot.lastCompileRequest,
      }),
    setTimeScale: async (timeScale) =>
      updateBridge((currentSnapshot) => ({
        ...currentSnapshot.bridge,
        timeScale,
      })),
    readTrajectorySamples: async () => [],
  };

  return {
    port,
    getTickCalls: () => tickCalls,
    publishBridge(update: (bridge: RuntimeBridgePortSnapshot["bridge"]) => RuntimeBridgePortSnapshot["bridge"]) {
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

  it("stops scheduling when playback pauses, resets, or unmounts", async () => {
    const scheduler = createFrameScheduler();
    const control = createControlledRuntimePort();

    const view = render(<RuntimePlaybackHarness runtimePort={control.port} scheduler={scheduler} />);

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
});
