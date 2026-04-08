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
    playbackMode: "precomputed" as const,
    totalDurationSeconds: DEFAULT_PRECOMPUTED_DURATION_SECONDS,
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
    mode: "precomputed" as const,
    precomputeDurationSeconds: DEFAULT_PRECOMPUTED_DURATION_SECONDS,
    realtimeDurationCapSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    ...overrides,
  };
}

describe("BottomTransportBar", () => {
  it("renders the compact calculate-first layout with disabled seek controls before calculation", () => {
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

    expect(screen.getByRole("button", { name: /calculate/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /pause/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /step/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reset/i })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: /playback mode/i })).toBeNull();
    expect(screen.getByRole("combobox", { name: /speed/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: "0.25x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "0.5x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2x" })).toBeNull();
    expect(screen.queryByRole("button", { name: "4x" })).toBeNull();
    expect(screen.getByText("12.50 s")).toBeDefined();
    expect(screen.queryByText("Realtime cap 40.00 s")).toBeNull();
    expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText("Jump to time") as HTMLInputElement).disabled).toBe(true);
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

  it("routes calculate-first transport actions, duration changes, and speed changes through the provided callbacks", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /calculate/i }));
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /step/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    fireEvent.change(screen.getByLabelText("Precompute duration"), {
      target: { value: "32" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /speed/i }), {
      target: { value: "2" },
    });

    expect(calls).toEqual([
      "start",
      "pause",
      "reset",
      "duration:32",
      "scale:2",
    ]);
  });

  it("shows stale-result guidance and promotes recalculation", () => {
    render(
      <BottomTransportBar
        runtime={createRuntimeView({
          blockReason: "rebuild-required",
          canResume: true,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Results are out of date. Recalculate to review the latest motion.",
    );
    expect(screen.getByRole("button", { name: /recalculate/i })).toBeDefined();
    expect((screen.getByRole("button", { name: /recalculate/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(
      (screen.getByRole("button", { name: /step/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows calculate-first playback copy for ready and playing result states", () => {
    const { rerender } = render(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "running",
          currentTimeSeconds: 1.25,
          canSeek: true,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Showing the calculated result. Pause to inspect or jump to another time.",
    );

    rerender(
      <BottomTransportBar
        runtime={createRuntimeView({
          status: "paused",
          currentTimeSeconds: 1.25,
          canSeek: true,
        })}
        onPause={() => undefined}
        onReset={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Calculated result ready. Press Play result or jump to a time.",
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

  it("shows calculate-first progress while a result is being prepared", () => {
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

    expect(screen.getByRole("button", { name: "Calculating…" }).textContent).toBe("Calculating…");
    expect((screen.getByRole("button", { name: "Calculating…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId("transport-state-copy").textContent).toContain(
      "Calculating the result. Playback and time jump unlock when it finishes.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Calculating the result.",
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
      (screen.getByRole("button", { name: "Calculating…" }) as HTMLButtonElement).disabled,
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
    expect((screen.getByLabelText("Jump to time") as HTMLInputElement).disabled).toBe(false);
  });
});
