import type { ComponentType } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeBridgeBlockedAction,
  type RuntimeBridgeStatus,
  type RuntimePlaybackMode,
} from "../state/runtimeBridge";
import { BottomTransportBar } from "./BottomTransportBar";

afterEach(() => {
  cleanup();
});

const CompactBottomTransportBar = BottomTransportBar as ComponentType<Record<string, unknown>>;

function createRuntimeView(overrides: {
  status?: RuntimeBridgeStatus;
  currentTimeSeconds?: number;
  timeScale?: number;
  canResume?: boolean;
  blockReason?: "rebuild-required" | null;
  lastErrorMessage?: string | null;
  lastBlockedAction?: RuntimeBridgeBlockedAction | null;
  playbackMode?: RuntimePlaybackMode;
  totalDurationSeconds?: number;
  preparingProgress?: number | null;
  canSeek?: boolean;
} = {}) {
  return {
    status: "paused" as const,
    currentTimeSeconds: 0,
    timeScale: 1,
    canResume: true,
    blockReason: null,
    lastErrorMessage: null,
    lastBlockedAction: null,
    playbackMode: "realtime" as const,
    totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    preparingProgress: null,
    canSeek: false,
    ...overrides,
  };
}

function createPlaybackSettings(overrides: {
  mode?: RuntimePlaybackMode;
  precomputeDurationSeconds?: number;
  realtimeDurationCapSeconds?: number;
} = {}) {
  return {
    mode: "realtime" as const,
    precomputeDurationSeconds: DEFAULT_PRECOMPUTED_DURATION_SECONDS,
    realtimeDurationCapSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    ...overrides,
  };
}

describe("BottomTransportBar", () => {
  it("renders the compact playback layout with a speed dropdown instead of preset pills", () => {
    render(
      <CompactBottomTransportBar
        layout="compact"
        runtime={createRuntimeView({
          currentTimeSeconds: 12.5,
          status: "paused",
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /start/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /pause/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /step/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    expect(screen.getByRole("combobox", { name: /playback mode/i })).toBeDefined();
    expect(screen.getByRole("combobox", { name: /speed/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: "0.25x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "0.5x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "4x" })).toBeNull();
    expect(screen.getByText("12.50 s")).toBeDefined();
    expect(screen.queryByText("Realtime cap 40.00 s")).toBeNull();
  });

  it("renders a compact control row without helper copy when playback controls are hidden", () => {
    render(
      <CompactBottomTransportBar
        layout="compact"
        runtime={createRuntimeView({
          status: "paused",
          currentTimeSeconds: 3,
        })}
        showPlaybackControls={false}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("transport-compact-row")).toBeDefined();
    expect(screen.getByRole("combobox", { name: /speed/i })).toBeDefined();
    expect(screen.queryByTestId("transport-state-copy")).toBeNull();
    expect(screen.queryByText(/realtime cap/i)).toBeNull();
  });

  it("routes transport, playback settings, and speed changes through the provided callbacks", () => {
    const calls: string[] = [];

    render(
      <CompactBottomTransportBar
        layout="compact"
        runtime={createRuntimeView({
          playbackMode: "precomputed",
          totalDurationSeconds: 24,
        })}
        playbackSettings={createPlaybackSettings({
          mode: "precomputed",
          precomputeDurationSeconds: 24,
        })}
        onPause={() => {
          calls.push("pause");
        }}
        onPlaybackModeChange={(mode) => {
          calls.push(`mode:${mode}`);
        }}
        onPrecomputeDurationChange={(durationSeconds) => {
          calls.push(`duration:${durationSeconds}`);
        }}
        onReset={() => {
          calls.push("reset");
        }}
        onStart={() => {
          calls.push("start");
        }}
        onStep={() => {
          calls.push("step");
        }}
        onTimeScaleChange={(nextScale) => {
          calls.push(`scale:${nextScale}`);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /step/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /playback mode/i }), {
      target: { value: "precomputed" },
    });
    fireEvent.change(screen.getByLabelText("Precompute duration"), {
      target: { value: "32" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /speed/i }), {
      target: { value: "2" },
    });

    expect(calls).toEqual([
      "start",
      "pause",
      "step",
      "reset",
      "mode:precomputed",
      "duration:32",
      "scale:2",
    ]);
  });

  it("shows blocked-runtime guidance and disables actions that cannot run yet", () => {
    render(
      <BottomTransportBar
        runtime={createRuntimeView({
          canResume: false,
          blockReason: "rebuild-required",
          lastBlockedAction: {
            action: "start",
            message: "Rebuild required before starting runtime.",
          },
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rebuild required before starting runtime.",
    );
    expect(
      (screen.getByRole("button", { name: /start/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: /start/i }).getAttribute("title")).toBe(
      "Rebuild required before starting runtime.",
    );
    expect(
      (screen.getByRole("button", { name: /step/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows clearer classroom playback copy for running and paused states", () => {
    const { rerender } = render(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "running",
          currentTimeSeconds: 1.25,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Runtime is playing. Pause to inspect the current motion.",
    );

    rerender(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "paused",
          currentTimeSeconds: 1.25,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Runtime is paused on the current frame.",
    );
  });

  it("shows a precomputed duration input defaulting to 20 seconds", () => {
    render(
      <BottomTransportBar
        runtime={createRuntimeView({
          playbackMode: "precomputed",
          totalDurationSeconds: DEFAULT_PRECOMPUTED_DURATION_SECONDS,
        })}
        playbackSettings={createPlaybackSettings({
          mode: "precomputed",
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect((screen.getByLabelText("Precompute duration") as HTMLInputElement).value).toBe("20");
  });

  it("shows build progress while cached playback is preparing", () => {
    render(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "preparing",
          playbackMode: "precomputed",
          totalDurationSeconds: 20,
          preparingProgress: 0.4,
        })}
        playbackSettings={createPlaybackSettings({
          mode: "precomputed",
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Preparing…" }).textContent).toBe("Preparing…");
    expect((screen.getByRole("button", { name: "Preparing…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Cached playback is being calculated.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Calculating cached playback frames.",
    );
    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("40%");
  });

  it("keeps compact preparing feedback prominent and disables pause during cache building", () => {
    render(
      <CompactBottomTransportBar
        layout="compact"
        runtime={createRuntimeView({
          status: "preparing",
          playbackMode: "precomputed",
          totalDurationSeconds: 20,
          preparingProgress: 0.4,
          canSeek: false,
        })}
        playbackSettings={createPlaybackSettings({
          mode: "precomputed",
          precomputeDurationSeconds: 20,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Preparing…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: /pause/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: /step/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("transport-compact-preparing-badge").textContent).toContain(
      "Preparing 40%",
    );
    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("40%");
  });

  it("makes the transport timeline draggable once cached playback is ready", () => {
    render(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "paused",
          playbackMode: "precomputed",
          totalDurationSeconds: 20,
          canSeek: true,
          currentTimeSeconds: 4,
        })}
        playbackSettings={createPlaybackSettings({
          mode: "precomputed",
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onSeek={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(
      (screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled,
    ).toBe(false);
  });
});
