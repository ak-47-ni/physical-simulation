import { useEffect, useEffectEvent, useRef } from "react";

import type { RuntimeBridgePort, RuntimeBridgePortSnapshot } from "./runtimeBridge";

type FrameScheduler = (callback: FrameRequestCallback) => number;
type FrameCanceller = (handle: number) => void;

export type UseRuntimePlaybackLoopOptions = {
  runtimePort?: RuntimeBridgePort;
  snapshot?: RuntimeBridgePortSnapshot;
  scheduleFrame?: FrameScheduler;
  cancelFrame?: FrameCanceller;
};

function scheduleBrowserFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => callback(Date.now()), 16);
}

function cancelBrowserFrame(handle: number) {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  globalThis.clearTimeout(handle);
}

function shouldPlayRuntime(snapshot: RuntimeBridgePortSnapshot | undefined): boolean {
  if (!snapshot) {
    return false;
  }

  return snapshot.bridge.status === "running" && !snapshot.bridge.rebuildRequired;
}

function hasPlaybackFeedback(snapshot: RuntimeBridgePortSnapshot): boolean {
  return (
    snapshot.bridge.lastErrorMessage !== null || snapshot.bridge.lastBlockedAction !== null
  );
}

export function useRuntimePlaybackLoop(options: UseRuntimePlaybackLoopOptions = {}): void {
  const frameHandleRef = useRef<number | null>(null);
  const tickInFlightRef = useRef(false);
  const playbackEnabledRef = useRef(false);

  const runtimePort = options.runtimePort;
  const scheduleFrame = options.scheduleFrame ?? scheduleBrowserFrame;
  const cancelFrame = options.cancelFrame ?? cancelBrowserFrame;

  const cancelPendingFrame = useEffectEvent(() => {
    if (frameHandleRef.current === null) {
      return;
    }

    cancelFrame(frameHandleRef.current);
    frameHandleRef.current = null;
  });

  const scheduleNextFrame = useEffectEvent(() => {
    if (!runtimePort || frameHandleRef.current !== null || tickInFlightRef.current) {
      return;
    }

    frameHandleRef.current = scheduleFrame(() => {
      frameHandleRef.current = null;
      void performTick();
    });
  });

  const performTick = useEffectEvent(async () => {
    if (!runtimePort || tickInFlightRef.current) {
      return;
    }

    const currentSnapshot = runtimePort.getSnapshot();

    if (!shouldPlayRuntime(currentSnapshot) || hasPlaybackFeedback(currentSnapshot)) {
      return;
    }

    tickInFlightRef.current = true;

    try {
      await runtimePort.tick();
    } catch {
      // The runtime port already publishes teacher-readable command failures.
    } finally {
      tickInFlightRef.current = false;

      const nextSnapshot = runtimePort.getSnapshot();

      if (
        !playbackEnabledRef.current ||
        !shouldPlayRuntime(nextSnapshot) ||
        hasPlaybackFeedback(nextSnapshot)
      ) {
        return;
      }

      scheduleNextFrame();
    }
  });

  useEffect(() => {
    const shouldPlay = shouldPlayRuntime(options.snapshot) && !hasPlaybackFeedback(options.snapshot);

    playbackEnabledRef.current = shouldPlay;

    if (!shouldPlay) {
      cancelPendingFrame();
      return;
    }

    scheduleNextFrame();

    return () => {
      playbackEnabledRef.current = false;
      cancelPendingFrame();
    };
  }, [cancelPendingFrame, options.snapshot, scheduleNextFrame, runtimePort]);
}
