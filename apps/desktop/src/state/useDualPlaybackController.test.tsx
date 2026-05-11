import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialSceneEntities } from "./editorStore";
import { createMockRuntimeBridgePort, type RuntimeBridgePort } from "./runtimeBridge";
import { createDefaultSceneAuthoringSettings } from "./sceneAuthoringSettings";
import {
  useDualPlaybackController,
  type ImportedPrecomputedPlayback,
} from "./useDualPlaybackController";

const FRAME_STEP_SECONDS = 1 / 60;

type QueuedAnimationFrame = {
  callback: FrameRequestCallback;
  cancelled: boolean;
  handle: number;
  ran: boolean;
};

const EMPTY_ANNOTATION_STROKES: [] = [];
const EMPTY_CONSTRAINTS: [] = [];

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
  const port = createMockRuntimeBridgePort({
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

  return {
    ...port,
    compile: async (request) => {
      const snapshot = await port.compile(request);

      return {
        ...snapshot,
        bridge: {
          ...snapshot.bridge,
          currentFrame: {
            frameNumber: 0,
            entities: [
              {
                id: "ball-1",
                transform: {
                  x: 0,
                  y: 0,
                  rotation: 0,
                },
              },
            ],
          },
        },
      };
    },
  };
}

type HarnessOverrides = {
  annotationStrokes?: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
  constraints?: [];
  entities?: ReturnType<typeof createInitialSceneEntities>;
  importedPrecomputedPlayback?: ImportedPrecomputedPlayback | null;
};

function useDualPlaybackControllerHarness(
  runtimePort: RuntimeBridgePort,
  overrides: HarnessOverrides = {},
) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(() => runtimePort.getSnapshot());
  const [defaultEntities] = useState(() => createInitialSceneEntities());
  const [sceneSettings] = useState(() => createDefaultSceneAuthoringSettings());
  const annotationStrokes = overrides.annotationStrokes ?? EMPTY_ANNOTATION_STROKES;
  const constraints = overrides.constraints ?? EMPTY_CONSTRAINTS;
  const entities = overrides.entities ?? defaultEntities;

  useEffect(() => runtimePort.subscribe(setRuntimeSnapshot), [runtimePort]);

  return {
    ...useDualPlaybackController({
      analyzerId: "traj-1",
      annotationStrokes,
      constraints,
      entities,
      importedPrecomputedPlayback: overrides.importedPrecomputedPlayback,
      runtimePort,
      runtimeSnapshot,
      sceneSettings,
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
  it("defaults new sessions to precomputed playback with an uncomputed result", () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    expect(result.current.playbackMode).toBe("precomputed");
    expect(result.current.precomputeDurationSeconds).toBe(5);
    expect(result.current.playbackResultState).toBe("uncomputed");
    expect(result.current.seekEnabled).toBe(false);
    expect(result.current.transportRuntime.canSeek).toBe(false);
  });

  it("normalizes precompute duration edits to whole seconds with a one-second floor", () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    act(() => {
      result.current.handlePrecomputeDurationChange(1.01666666666667);
    });

    expect(result.current.precomputeDurationSeconds).toBe(1);

    act(() => {
      result.current.handlePrecomputeDurationChange(2.6);
    });

    expect(result.current.precomputeDurationSeconds).toBe(3);

    act(() => {
      result.current.handlePrecomputeDurationChange(0.1);
    });

    expect(result.current.precomputeDurationSeconds).toBe(1);
  });

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
    expect(result.current.playbackResultState).toBe("calculating");
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
    expect(result.current.playbackResultState).toBe("ready");
    expect(result.current.seekEnabled).toBe(true);
  });

  it("keeps the latest cached seek target and prevents stale running frames from re-entering", async () => {
    const animationFrame = createControlledAnimationFrame();
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await startPrecomputedPlayback(result, 4, animationFrame);

    await waitFor(() => {
      expect(result.current.playbackMode).toBe("precomputed");
      expect(result.current.playbackResultState).toBe("ready");
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

  it("starts precomputed playback from backend runtime frame zero instead of authored fallback", async () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await startPrecomputedPlayback(result, 1);

    expect(result.current.playbackResultState).toBe("ready");
    expect(result.current.currentPlaybackTimeSeconds).toBe(0);
    expect(result.current.visibleRuntimeFrame).toMatchObject({
      frameNumber: 0,
      entities: [
        {
          id: "ball-1",
          transform: {
            x: 0,
            y: 0,
          },
        },
      ],
    });
  });

  it("does not skip cached physics frames when a browser paint is delayed", async () => {
    const animationFrame = createControlledAnimationFrame();
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    await startPrecomputedPlayback(result, 1, animationFrame);

    await waitFor(() => {
      expect(result.current.transportRuntime.status).toBe("running");
      expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(0);
      expect(animationFrame.pendingCount()).toBe(1);
    });
    const initialPosition = result.current.visibleRuntimeFrame?.entities[0]?.transform;

    act(() => {
      animationFrame.runNext(0);
    });

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      animationFrame.runNext(34);
    });

    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(1);
    expect(
      (result.current.visibleRuntimeFrame?.entities[0]?.transform.x ?? 0) -
        (initialPosition?.x ?? 0),
    ).toBe(1);
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

  it("marks cached playback stale after runtime-relevant edits and disables seek until recalculated", async () => {
    const runtimePort = createControllerRuntimePort();
    const initialEntities = createInitialSceneEntities();
    const { result, rerender } = renderHook(
      ({ entities }) => useDualPlaybackControllerHarness(runtimePort, { entities }),
      {
        initialProps: {
          entities: initialEntities,
        },
      },
    );

    await startPrecomputedPlayback(result);

    await waitFor(() => {
      expect(result.current.playbackResultState).toBe("ready");
      expect(result.current.seekEnabled).toBe(true);
    });

    const nextEntities = [...initialEntities];
    nextEntities[0] = {
      ...nextEntities[0],
      x: nextEntities[0].x + 1,
    };

    rerender({
      entities: nextEntities,
    });

    expect(result.current.playbackMode).toBe("precomputed");
    expect(result.current.playbackResultState).toBe("stale");
    expect(result.current.seekEnabled).toBe(false);
    expect(result.current.visibleRuntimeFrame).toBeNull();
  });

  it("keeps cached playback visible after annotation-only edits", async () => {
    const runtimePort = createControllerRuntimePort();
    const { result, rerender } = renderHook(
      ({ annotationStrokes }) =>
        useDualPlaybackControllerHarness(runtimePort, { annotationStrokes }),
      {
        initialProps: {
          annotationStrokes: EMPTY_ANNOTATION_STROKES,
        },
      },
    );

    await startPrecomputedPlayback(result);

    await waitFor(() => {
      expect(result.current.playbackResultState).toBe("ready");
      expect(result.current.seekEnabled).toBe(true);
    });

    act(() => {
      result.current.seekPrecomputedPlayback(1.25);
    });

    const cachedFrameNumber = result.current.visibleRuntimeFrame?.frameNumber;
    const cachedPlaybackTime = result.current.currentPlaybackTimeSeconds;

    rerender({
      annotationStrokes: [
        {
          id: "stroke-1",
          points: [
            { x: 12, y: 16 },
            { x: 30, y: 32 },
          ],
        },
      ],
    });

    expect(result.current.playbackMode).toBe("precomputed");
    expect(result.current.playbackResultState).toBe("ready");
    expect(result.current.seekEnabled).toBe(true);
    expect(result.current.currentPlaybackTimeSeconds).toBeCloseTo(cachedPlaybackTime, 5);
    expect(result.current.visibleRuntimeFrame?.frameNumber).toBe(cachedFrameNumber);
  });

  it("hydrates imported precomputed frames as a ready cached result", () => {
    const runtimePort = createControllerRuntimePort();
    const importedPrecomputedPlayback: ImportedPrecomputedPlayback = {
      frames: [
        {
          frame: {
            frameNumber: 0,
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 10, y: 20 },
              },
            ],
          },
          timeSeconds: 0,
        },
        {
          frame: {
            frameNumber: 1,
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 11, y: 22 },
                velocity: { x: 1, y: 2 },
              },
            ],
          },
          timeSeconds: FRAME_STEP_SECONDS,
        },
      ],
      importId: "result-file-1",
      precomputeDurationSeconds: 1,
    };
    const { result } = renderHook(() =>
      useDualPlaybackControllerHarness(runtimePort, { importedPrecomputedPlayback }),
    );

    expect(result.current.playbackMode).toBe("precomputed");
    expect(result.current.precomputeDurationSeconds).toBe(1);
    expect(result.current.playbackResultState).toBe("ready");
    expect(result.current.seekEnabled).toBe(true);
    expect(result.current.currentPlaybackTimeSeconds).toBe(0);
    expect(result.current.visibleRuntimeFrame?.entities[0]).toMatchObject({
      id: "ball-1",
      transform: { x: 10, y: 20 },
    });

    act(() => {
      result.current.seekPrecomputedPlayback(FRAME_STEP_SECONDS);
    });

    expect(result.current.currentPlaybackTimeSeconds).toBe(FRAME_STEP_SECONDS);
    expect(result.current.visibleRuntimeFrame?.entities[0]).toMatchObject({
      transform: { x: 11, y: 22 },
      velocity: { x: 1, y: 2 },
    });
  });

  it("ignores seek requests while realtime playback remains active", async () => {
    const runtimePort = createControllerRuntimePort();
    const { result } = renderHook(() => useDualPlaybackControllerHarness(runtimePort));

    act(() => {
      result.current.handlePlaybackModeChange("realtime");
    });

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
