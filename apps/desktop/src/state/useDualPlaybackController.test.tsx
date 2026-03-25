import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialSceneEntities } from "./editorStore";
import { createMockRuntimeBridgePort, type RuntimeBridgePort } from "./runtimeBridge";
import { createDefaultSceneAuthoringSettings } from "./sceneAuthoringSettings";
import { useDualPlaybackController } from "./useDualPlaybackController";

const FRAME_STEP_SECONDS = 1 / 60;

type QueuedAnimationFrame = {
  callback: FrameRequestCallback;
  cancelled: boolean;
  handle: number;
  ran: boolean;
};

function createControlledAnimationFrame() {
  let nextHandle = 1;
  const queuedFrames: QueuedAnimationFrame[] = [];

  vi.stubGlobal(
    "requestAnimationFrame",
    ((callback: FrameRequestCallback) => {
      const frame: QueuedAnimationFrame = {
        callback,
        cancelled: false,
        handle: nextHandle,
        ran: false,
      };

      nextHandle += 1;
      queuedFrames.push(frame);

      return frame.handle;
    }) as typeof requestAnimationFrame,
  );

  vi.stubGlobal(
    "cancelAnimationFrame",
    ((handle: number) => {
      const frame = queuedFrames.find(
        (candidate) => candidate.handle === handle && candidate.ran === false,
      );

      if (frame) {
        frame.cancelled = true;
      }
    }) as typeof cancelAnimationFrame,
  );

  return {
    pendingCount() {
      return queuedFrames.filter((frame) => frame.ran === false && frame.cancelled === false)
        .length;
    },
    runNext(timestamp: number, options: { includeCancelled?: boolean } = {}) {
      const frame = queuedFrames.find(
        (candidate) =>
          candidate.ran === false && (options.includeCancelled === true || !candidate.cancelled),
      );

      if (!frame) {
        throw new Error("No queued animation frame available.");
      }

      frame.ran = true;
      frame.callback(timestamp);
      return frame.handle;
    },
  };
}

function roundToNearestFrameNumber(timeSeconds: number): number {
  return Math.round(Math.max(0, timeSeconds) / FRAME_STEP_SECONDS);
}

function roundToNearestFrameTime(timeSeconds: number): number {
  return roundToNearestFrameNumber(timeSeconds) * FRAME_STEP_SECONDS;
}

function createControllerRuntimePort(): RuntimeBridgePort {
  return createMockRuntimeBridgePort({
    createFrame: ({ nextFrameNumber }) => ({
      frameNumber: nextFrameNumber,
      entities: [
        {
          entityId: "ball-1",
          position: {
            x: nextFrameNumber,
            y: nextFrameNumber * 2,
          },
          rotation: 0,
        },
      ],
    }),
  });
}

function useDualPlaybackControllerHarness(runtimePort: RuntimeBridgePort) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(() => runtimePort.getSnapshot());
  const annotationStrokesRef = useRef([]);
  const constraintsRef = useRef([]);
  const entitiesRef = useRef(createInitialSceneEntities());
  const sceneSettingsRef = useRef(createDefaultSceneAuthoringSettings());

  useEffect(() => runtimePort.subscribe(setRuntimeSnapshot), [runtimePort]);

  return {
    ...useDualPlaybackController({
      analyzerId: "traj-1",
      annotationStrokes: annotationStrokesRef.current,
      constraints: constraintsRef.current,
      entities: entitiesRef.current,
      runtimePort,
      runtimeSnapshot,
      sceneSettings: sceneSettingsRef.current,
    }),
    runtimePort,
  };
}

async function startPrecomputedPlayback(
  result: {
    current: ReturnType<typeof useDualPlaybackControllerHarness>;
  },
  durationSeconds = 4,
  animationFrame?: ReturnType<typeof createControlledAnimationFrame>,
) {
  act(() => {
    result.current.handlePlaybackModeChange("precomputed");
  });

  act(() => {
    result.current.handlePrecomputeDurationChange(durationSeconds);
  });

  let startPromise: Promise<void> | null = null;

  act(() => {
    startPromise = result.current.handleTransportStart();
  });

  if (!animationFrame) {
    await act(async () => {
      await startPromise;
    });
    return;
  }

  await act(async () => {
    let settled = false;

    void startPromise?.then(() => {
      settled = true;
    });

    await flushMicrotasks();

    while (!settled) {
      if (animationFrame.pendingCount() > 0) {
        animationFrame.runNext(16);
      }

      await flushMicrotasks();
    }

    await startPromise;
  });
}

async function flushMicrotasks(iterations = 80) {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useDualPlaybackController", () => {
  it("exposes intermediate preparation progress before a precomputed build finishes", async () => {
    const animationFrame = createControlledAnimationFrame();
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));
    let startPromise: Promise<void> | null = null;

    act(() => {
      result.current.handlePlaybackModeChange("precomputed");
    });

    act(() => {
      result.current.handlePrecomputeDurationChange(1);
    });

    act(() => {
      startPromise = result.current.handleTransportStart();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.isPreparing).toBe(true);
    expect(result.current.preparationProgress).toBeGreaterThan(0);
    expect(result.current.preparationProgress).toBeLessThan(1);
    expect(result.current.seekEnabled).toBe(false);

    await act(async () => {
      let guard = 0;

      while (result.current.isPreparing && guard < 20) {
        if (animationFrame.pendingCount() > 0) {
          animationFrame.runNext(16);
        }

        await flushMicrotasks();
        guard += 1;
      }

      await startPromise;
    });

    expect(result.current.transportRuntime.status).toBe("running");
    expect(result.current.seekEnabled).toBe(true);
  });

  it("keeps the latest cached seek target and prevents stale running frames from re-entering", async () => {
    const animationFrame = createControlledAnimationFrame();
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await startPrecomputedPlayback(result, 4, animationFrame);

    await waitFor(() => {
      expect(result.current.playbackMode).toBe("precomputed");
      expect(result.current.seekEnabled).toBe(true);
      expect(result.current.transportRuntime.status).toBe("running");
      expect(animationFrame.pendingCount()).toBe(1);
    });

    act(() => {
      result.current.seekPrecomputedPlayback(1);
      result.current.seekPrecomputedPlayback(2);
      result.current.seekPrecomputedPlayback(4);
    });

    expect(result.current.transportRuntime.status).toBe("paused");
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(4, 5);
    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(240);
    expect(animationFrame.pendingCount()).toBe(0);

    act(() => {
      animationFrame.runNext(16, {
        includeCancelled: true,
      });
    });

    expect(result.current.transportRuntime.status).toBe("paused");
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(4, 5);
    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(240);
    expect(animationFrame.pendingCount()).toBe(0);
  });

  it("pauses cached playback seeks onto the nearest cached frame for drag and typed targets", async () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await startPrecomputedPlayback(result);

    await waitFor(() => {
      expect(result.current.transportRuntime.status).toBe("running");
    });

    act(() => {
      result.current.seekPrecomputedPlayback(1.24);
    });

    expect(result.current.transportRuntime.status).toBe("paused");
    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(
      roundToNearestFrameNumber(1.24),
    );
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(
      roundToNearestFrameTime(1.24),
      5,
    );

    act(() => {
      result.current.seekPrecomputedPlayback(2.51);
    });

    expect(result.current.transportRuntime.status).toBe("paused");
    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(
      roundToNearestFrameNumber(2.51),
    );
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(
      roundToNearestFrameTime(2.51),
      5,
    );
  });

  it("ignores seek requests while realtime playback remains active", async () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await act(async () => {
      await result.current.handleTransportStep();
    });

    const beforeSeekTime = result.current.currentPlaybackTimeSeconds;
    const beforeSeekRuntimeTime = runtimePort.getSnapshot().bridge.currentTimeSeconds;

    act(() => {
      result.current.seekPrecomputedPlayback(3.5);
    });

    expect(result.current.playbackMode).toBe("realtime");
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(beforeSeekTime, 5);
    expect(runtimePort.getSnapshot().bridge.currentTimeSeconds).toBeCloseTo(
      beforeSeekRuntimeTime,
      5,
    );
  });
});
