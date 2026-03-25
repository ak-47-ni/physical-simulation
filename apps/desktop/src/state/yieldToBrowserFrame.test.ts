import { afterEach, describe, expect, it, vi } from "vitest";

import { yieldToBrowserFrame } from "./yieldToBrowserFrame";

describe("yieldToBrowserFrame", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves on a future animation frame when requestAnimationFrame is available", async () => {
    let queuedCallback: FrameRequestCallback | null = null;

    vi.stubGlobal(
      "requestAnimationFrame",
      ((callback: FrameRequestCallback) => {
        queuedCallback = callback;
        return 1;
      }) as typeof requestAnimationFrame,
    );

    const yieldPromise = yieldToBrowserFrame();
    let resolved = false;

    void yieldPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(queuedCallback).not.toBeNull();

    queuedCallback?.(16);
    await yieldPromise;

    expect(resolved).toBe(true);
  });

  it("falls back to a macrotask when requestAnimationFrame is unavailable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", undefined);

    const yieldPromise = yieldToBrowserFrame();
    let resolved = false;

    void yieldPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(0);
    await yieldPromise;

    expect(resolved).toBe(true);
  });
});
