import { useEffect, useRef, useState } from "react";

import type { AnnotationLayerStroke } from "../annotation/AnnotationLayer";
import type { BottomTransportRuntimeView } from "../panels/BottomTransportBar";
import type { PlaybackMode } from "../panels/PlaybackTransportDeck";
import type { EditorConstraint } from "./editorConstraints";
import type { EditorSceneEntity } from "./editorStore";
import {
  type RuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
  type RuntimeFrameView,
  type RuntimeResultState,
} from "./runtimeBridge";
import { createRuntimeCompileRequestFromEditorState } from "./runtimeCompileRequest";
import type { SceneAuthoringSettings } from "./sceneAuthoringSettings";
import { useRuntimePlaybackLoop } from "./useRuntimePlaybackLoop";
import { yieldToBrowserFrame } from "./yieldToBrowserFrame";

export const DEFAULT_PRECOMPUTE_DURATION_SECONDS = 20;
export const REALTIME_MAX_DURATION_SECONDS = 40;
const PRECOMPUTE_STEP_SECONDS = 1 / 60;
const PRECOMPUTE_PROGRESS_BATCH_SIZE = 10;

type PrecomputedFrame = {
  frame: RuntimeFrameView | null;
  timeSeconds: number;
};

type PrecomputedPlaybackState = {
  currentFrameIndex: number;
  errorMessage: string | null;
  frames: PrecomputedFrame[];
  preparationProgress: number;
  resultState: RuntimeResultState;
  status: "idle" | "paused" | "preparing" | "running";
};

type UseDualPlaybackControllerInput = {
  analyzerId: string;
  annotationStrokes: AnnotationLayerStroke[];
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  runtimePort: RuntimeBridgePort;
  runtimeSnapshot: RuntimeBridgePortSnapshot;
  sceneSettings: SceneAuthoringSettings;
};

type UseDualPlaybackControllerResult = {
  currentPlaybackTimeSeconds: number;
  handlePlaybackModeChange: (nextMode: PlaybackMode) => void;
  handlePrecomputeDurationChange: (nextDurationSeconds: number) => void;
  handleTransportPause: () => void;
  handleTransportReset: () => void;
  handleTransportStart: () => Promise<void>;
  handleTransportStep: () => Promise<void>;
  handleTransportTimeScaleChange: (timeScale: number) => void;
  isPreparing: boolean;
  playbackLocked: boolean;
  playbackMode: PlaybackMode;
  playbackResultState: RuntimeResultState;
  precomputeDurationSeconds: number;
  preparationProgress: number;
  realtimeCapSeconds: number;
  seekEnabled: boolean;
  seekPrecomputedPlayback: (timeSeconds: number) => void;
  timelineMaxSeconds: number;
  transportRuntime: BottomTransportRuntimeView;
  visibleRuntimeFrame: RuntimeFrameView | null;
};

function createInitialPrecomputedPlaybackState(): PrecomputedPlaybackState {
  return {
    currentFrameIndex: 0,
    errorMessage: null,
    frames: [],
    preparationProgress: 0,
    resultState: "uncomputed",
    status: "idle",
  };
}

function schedulePlaybackFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => callback(Date.now()), 16);
}

function cancelPlaybackFrame(handle: number) {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  globalThis.clearTimeout(handle);
}

function clampPlaybackSeconds(value: number, maxSeconds: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(maxSeconds, value));
}

function findPrecomputedFrameIndex(frames: PrecomputedFrame[], timeSeconds: number): number {
  if (frames.length === 0) {
    return 0;
  }

  const clampedTime = clampPlaybackSeconds(timeSeconds, frames.at(-1)?.timeSeconds ?? 0);
  let nearestIndex = 0;
  let nearestDelta = Number.POSITIVE_INFINITY;

  for (let index = 0; index < frames.length; index += 1) {
    const frameDelta = Math.abs(frames[index].timeSeconds - clampedTime);

    if (frameDelta < nearestDelta) {
      nearestDelta = frameDelta;
      nearestIndex = index;
      continue;
    }

    if (frames[index].timeSeconds > clampedTime && frameDelta > nearestDelta) {
      break;
    }
  }

  return nearestIndex;
}

function maxCachedFrameAdvancePerPaint(timeScale: number): number {
  if (!Number.isFinite(timeScale) || timeScale <= 1) {
    return 1;
  }

  return Math.ceil(timeScale);
}

export function useDualPlaybackController(
  input: UseDualPlaybackControllerInput,
): UseDualPlaybackControllerResult {
  const {
    analyzerId,
    annotationStrokes,
    constraints,
    entities,
    runtimePort,
    runtimeSnapshot,
    sceneSettings,
  } = input;
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("precomputed");
  const [precomputeDurationSeconds, setPrecomputeDurationSeconds] = useState(
    DEFAULT_PRECOMPUTE_DURATION_SECONDS,
  );
  const [precomputedPlayback, setPrecomputedPlayback] = useState(
    createInitialPrecomputedPlaybackState,
  );
  const precomputeBuildTokenRef = useRef(0);
  const precomputedPlaybackFrameHandleRef = useRef<number | null>(null);
  const precomputedPlaybackLastTimestampRef = useRef<number | null>(null);
  const precomputedPlaybackLoopTokenRef = useRef(0);

  useRuntimePlaybackLoop({
    runtimePort,
    snapshot: playbackMode === "realtime" ? runtimeSnapshot : undefined,
  });

  useEffect(() => {
    precomputeBuildTokenRef.current += 1;
    invalidatePrecomputedPlaybackLoop();
    setPrecomputedPlayback((current) => ({
      ...createInitialPrecomputedPlaybackState(),
      resultState: readInvalidatedPrecomputedResultState(current.resultState),
    }));
  }, [annotationStrokes, constraints, entities, sceneSettings]);

  useEffect(() => {
    if (playbackMode !== "realtime") {
      return;
    }

    if (
      runtimeSnapshot.bridge.status !== "running" ||
      runtimeSnapshot.bridge.currentTimeSeconds < REALTIME_MAX_DURATION_SECONDS
    ) {
      return;
    }

    void runtimePort.pause();
  }, [
    playbackMode,
    runtimePort,
    runtimeSnapshot.bridge.currentTimeSeconds,
    runtimeSnapshot.bridge.status,
  ]);

  useEffect(() => {
    if (
      playbackMode !== "precomputed" ||
      precomputedPlayback.status !== "running" ||
      precomputedPlayback.frames.length === 0
    ) {
      invalidatePrecomputedPlaybackLoop();

      return;
    }

    const loopToken = precomputedPlaybackLoopTokenRef.current + 1;
    precomputedPlaybackLoopTokenRef.current = loopToken;

    function stepPlayback(timestamp: number) {
      if (precomputedPlaybackLoopTokenRef.current !== loopToken) {
        return;
      }

      const lastTimestamp = precomputedPlaybackLastTimestampRef.current ?? timestamp;
      precomputedPlaybackLastTimestampRef.current = timestamp;
      const elapsedSeconds = Math.max(0, (timestamp - lastTimestamp) / 1000);
      let shouldScheduleNextFrame = true;

      setPrecomputedPlayback((current) => {
        if (
          precomputedPlaybackLoopTokenRef.current !== loopToken ||
          current.status !== "running" ||
          current.frames.length === 0
        ) {
          shouldScheduleNextFrame = false;
          return current;
        }

        const maxTimeSeconds = current.frames.at(-1)?.timeSeconds ?? 0;
        const currentTimeSeconds = current.frames[current.currentFrameIndex]?.timeSeconds ?? 0;
        const nextTimeSeconds = clampPlaybackSeconds(
          currentTimeSeconds + elapsedSeconds * runtimeSnapshot.bridge.timeScale,
          maxTimeSeconds,
        );
        const targetFrameIndex = findPrecomputedFrameIndex(current.frames, nextTimeSeconds);
        const nextFrameIndex = Math.min(
          targetFrameIndex,
          current.currentFrameIndex +
            maxCachedFrameAdvancePerPaint(runtimeSnapshot.bridge.timeScale),
        );

        if (nextFrameIndex >= current.frames.length - 1) {
          shouldScheduleNextFrame = false;
          return {
            ...current,
            currentFrameIndex: current.frames.length - 1,
            status: "paused",
          };
        }

        if (nextFrameIndex === current.currentFrameIndex) {
          return current;
        }

        return {
          ...current,
          currentFrameIndex: nextFrameIndex,
        };
      });

      if (
        !shouldScheduleNextFrame ||
        precomputedPlaybackLoopTokenRef.current !== loopToken
      ) {
        precomputedPlaybackFrameHandleRef.current = null;
        return;
      }

      precomputedPlaybackFrameHandleRef.current = schedulePlaybackFrame(stepPlayback);
    }

    precomputedPlaybackFrameHandleRef.current = schedulePlaybackFrame(stepPlayback);

    return () => {
      if (precomputedPlaybackLoopTokenRef.current === loopToken) {
        invalidatePrecomputedPlaybackLoop();
      }
    };
  }, [
    playbackMode,
    precomputedPlayback.frames,
    precomputedPlayback.status,
    runtimeSnapshot.bridge.timeScale,
  ]);

  function createCurrentCompileRequest() {
    return createRuntimeCompileRequestFromEditorState({
      analyzerId,
      annotations: annotationStrokes,
      constraints,
      entities,
      settings: sceneSettings,
    });
  }

  function invalidatePrecomputedPlaybackLoop() {
    precomputedPlaybackLoopTokenRef.current += 1;
    precomputedPlaybackLastTimestampRef.current = null;

    if (precomputedPlaybackFrameHandleRef.current !== null) {
      cancelPlaybackFrame(precomputedPlaybackFrameHandleRef.current);
      precomputedPlaybackFrameHandleRef.current = null;
    }
  }

  function resetPrecomputedPlayback(clearCache: boolean) {
    precomputeBuildTokenRef.current += 1;
    invalidatePrecomputedPlaybackLoop();

    setPrecomputedPlayback((current) => ({
      currentFrameIndex: 0,
      errorMessage: null,
      frames: clearCache ? [] : current.frames,
      preparationProgress: 0,
      resultState: clearCache
        ? readInvalidatedPrecomputedResultState(current.resultState)
        : current.resultState,
      status: "idle",
    }));
  }

  function seekPrecomputedPlayback(timeSeconds: number) {
    if (playbackMode !== "precomputed") {
      return;
    }

    invalidatePrecomputedPlaybackLoop();

    setPrecomputedPlayback((current) => {
      if (
        current.frames.length === 0 ||
        current.status === "preparing" ||
        current.resultState !== "ready"
      ) {
        return current;
      }

      return {
        ...current,
        currentFrameIndex: findPrecomputedFrameIndex(current.frames, timeSeconds),
        status: "paused",
      };
    });
  }

  async function buildPrecomputedFrames(durationSeconds: number) {
    const buildToken = precomputeBuildTokenRef.current + 1;
    const targetDurationSeconds = Math.max(PRECOMPUTE_STEP_SECONDS, durationSeconds);
    const totalSteps = Math.max(1, Math.round(targetDurationSeconds / PRECOMPUTE_STEP_SECONDS));
    const previousResultState = precomputedPlayback.resultState;

    precomputeBuildTokenRef.current = buildToken;
    invalidatePrecomputedPlaybackLoop();
    setPrecomputedPlayback({
      currentFrameIndex: 0,
      errorMessage: null,
      frames: [],
      preparationProgress: 0,
      resultState: "calculating",
      status: "preparing",
    });

    try {
      const compileSnapshot = await runtimePort.compile(createCurrentCompileRequest());
      const startSnapshot = await runtimePort.start();

      const nextFrames: PrecomputedFrame[] = [
        {
          frame:
            startSnapshot.bridge.currentFrame ?? compileSnapshot.bridge.currentFrame ?? null,
          timeSeconds: 0,
        },
      ];
      let completedSteps = 0;

      while (completedSteps < totalSteps) {
        if (precomputeBuildTokenRef.current !== buildToken) {
          return null;
        }

        const nextSnapshot = await runtimePort.tick();
        const isPreparingResult =
          nextSnapshot.bridge.playbackMode === "precomputed" &&
          nextSnapshot.bridge.resultState !== "ready";
        const nextFrameTimeSeconds = clampPlaybackSeconds(
          nextSnapshot.bridge.currentTimeSeconds,
          targetDurationSeconds,
        );
        const previousFrameTimeSeconds = nextFrames.at(-1)?.timeSeconds ?? -1;
        const didAdvanceFrame = nextFrameTimeSeconds > previousFrameTimeSeconds;

        if (!isPreparingResult && didAdvanceFrame) {
          completedSteps += 1;
          nextFrames.push({
            frame: nextSnapshot.bridge.currentFrame,
            timeSeconds: nextFrameTimeSeconds,
          });
        }

        if (
          isPreparingResult ||
          completedSteps === totalSteps ||
          completedSteps % PRECOMPUTE_PROGRESS_BATCH_SIZE === 0
        ) {
          setPrecomputedPlayback((current) =>
            current.status === "preparing"
              ? {
                  ...current,
                  preparationProgress: isPreparingResult
                    ? nextSnapshot.bridge.preparingProgress ?? current.preparationProgress
                    : completedSteps / totalSteps,
                }
              : current,
          );

          if (completedSteps < totalSteps) {
            await yieldToBrowserFrame();

            if (precomputeBuildTokenRef.current !== buildToken) {
              return null;
            }
          }
        }
      }

      await runtimePort.pause();

      if (precomputeBuildTokenRef.current !== buildToken) {
        return null;
      }

      setPrecomputedPlayback({
        currentFrameIndex: 0,
        errorMessage: null,
        frames: nextFrames,
        preparationProgress: 1,
        resultState: "ready",
        status: "idle",
      });

      return nextFrames;
    } catch (error) {
      if (precomputeBuildTokenRef.current !== buildToken) {
        return null;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Precomputed playback build failed.";

      setPrecomputedPlayback({
        currentFrameIndex: 0,
        errorMessage,
        frames: [],
        preparationProgress: 0,
        resultState: readFailedPrecomputedBuildState(previousResultState),
        status: "idle",
      });

      try {
        await runtimePort.reset();
      } catch {
        // Reset failures are already surfaced by the runtime bridge.
      }

      return null;
    }
  }

  async function handleTransportStart() {
    if (playbackMode === "realtime") {
      void runtimePort.start();
      return;
    }

    if (precomputedPlayback.status === "preparing") {
      return;
    }

    if (
      precomputedPlayback.frames.length === 0 ||
      precomputedPlayback.resultState !== "ready"
    ) {
      const nextFrames = await buildPrecomputedFrames(precomputeDurationSeconds);

      if (!nextFrames || nextFrames.length === 0) {
        return;
      }
    }

    setPrecomputedPlayback((current) => ({
      ...current,
      currentFrameIndex:
        current.currentFrameIndex >= current.frames.length - 1 ? 0 : current.currentFrameIndex,
      errorMessage: null,
      status: "running",
    }));
  }

  function handleTransportPause() {
    if (playbackMode === "realtime") {
      void runtimePort.pause();
      return;
    }

    invalidatePrecomputedPlaybackLoop();

    setPrecomputedPlayback((current) => ({
      ...current,
      status: current.frames.length === 0 ? "idle" : "paused",
    }));
  }

  async function handleTransportStep() {
    if (playbackMode === "realtime") {
      void runtimePort.step();
      return;
    }

    if (precomputedPlayback.status === "preparing") {
      return;
    }

    if (
      precomputedPlayback.frames.length === 0 ||
      precomputedPlayback.resultState !== "ready"
    ) {
      const nextFrames = await buildPrecomputedFrames(precomputeDurationSeconds);

      if (!nextFrames || nextFrames.length === 0) {
        return;
      }
    }

    setPrecomputedPlayback((current) => ({
      ...current,
      currentFrameIndex: Math.min(current.frames.length - 1, current.currentFrameIndex + 1),
      status: "paused",
    }));
  }

  function handleTransportReset() {
    if (playbackMode === "realtime") {
      void runtimePort.reset();
      return;
    }

    resetPrecomputedPlayback(false);
    void runtimePort.reset();
  }

  function handlePlaybackModeChange(nextMode: PlaybackMode) {
    if (nextMode === playbackMode) {
      return;
    }

    setPlaybackMode(nextMode);
    resetPrecomputedPlayback(true);
    void runtimePort.reset();
  }

  function handlePrecomputeDurationChange(nextDurationSeconds: number) {
    if (
      !Number.isFinite(nextDurationSeconds) ||
      nextDurationSeconds <= 0 ||
      nextDurationSeconds === precomputeDurationSeconds
    ) {
      return;
    }

    setPrecomputeDurationSeconds(nextDurationSeconds);
    resetPrecomputedPlayback(true);
    void runtimePort.reset();
  }

  function handleTransportTimeScaleChange(timeScale: number) {
    void runtimePort.setTimeScale(timeScale);
  }

  const precomputedFrame = precomputedPlayback.frames[precomputedPlayback.currentFrameIndex] ?? null;
  const visibleRuntimeFrame =
    playbackMode === "precomputed"
      ? (precomputedPlayback.resultState === "ready" ? (precomputedFrame?.frame ?? null) : null)
      : runtimeSnapshot.bridge.currentFrame;
  const currentPlaybackTimeSeconds =
    playbackMode === "precomputed"
      ? (precomputedPlayback.resultState === "ready" ? (precomputedFrame?.timeSeconds ?? 0) : 0)
      : clampPlaybackSeconds(
          runtimeSnapshot.bridge.currentTimeSeconds,
          REALTIME_MAX_DURATION_SECONDS,
        );
  const seekEnabled =
    playbackMode === "precomputed" &&
    precomputedPlayback.resultState === "ready" &&
    precomputedPlayback.frames.length > 0 &&
    precomputedPlayback.status !== "preparing";
  const timelineMaxSeconds =
    playbackMode === "precomputed"
      ? precomputeDurationSeconds
      : REALTIME_MAX_DURATION_SECONDS;
  const transportRuntime: BottomTransportRuntimeView =
    playbackMode === "precomputed"
      ? {
          ...runtimeSnapshot.bridge,
          blockReason: null,
          canResume: precomputedPlayback.status !== "preparing",
          canSeek: precomputedPlayback.resultState === "ready",
          currentTimeSeconds: currentPlaybackTimeSeconds,
          lastBlockedAction: null,
          lastErrorMessage: precomputedPlayback.errorMessage,
          status:
            precomputedPlayback.status === "running"
              ? "running"
              : precomputedPlayback.status === "paused"
                ? "paused"
                : "idle",
        }
      : {
          ...runtimeSnapshot.bridge,
          currentTimeSeconds: currentPlaybackTimeSeconds,
        };
  const playbackLocked =
    runtimeSnapshot.bridge.status === "running" ||
    precomputedPlayback.status === "preparing" ||
    (playbackMode === "precomputed" && precomputedPlayback.status === "running");
  const playbackResultState =
    playbackMode === "precomputed"
      ? precomputedPlayback.resultState
      : runtimeSnapshot.bridge.resultState;

  return {
    currentPlaybackTimeSeconds,
    handlePlaybackModeChange,
    handlePrecomputeDurationChange,
    handleTransportPause,
    handleTransportReset,
    handleTransportStart,
    handleTransportStep,
    handleTransportTimeScaleChange,
    isPreparing: precomputedPlayback.status === "preparing",
    playbackLocked,
    playbackMode,
    playbackResultState,
    precomputeDurationSeconds,
    preparationProgress: precomputedPlayback.preparationProgress,
    realtimeCapSeconds: REALTIME_MAX_DURATION_SECONDS,
    seekEnabled,
    seekPrecomputedPlayback,
    timelineMaxSeconds,
    transportRuntime,
    visibleRuntimeFrame,
  };
}

function readInvalidatedPrecomputedResultState(
  resultState: RuntimeResultState,
): RuntimeResultState {
  if (resultState === "ready" || resultState === "calculating" || resultState === "stale") {
    return "stale";
  }

  return "uncomputed";
}

function readFailedPrecomputedBuildState(
  resultState: RuntimeResultState,
): RuntimeResultState {
  if (resultState === "stale") {
    return "stale";
  }

  return "uncomputed";
}
