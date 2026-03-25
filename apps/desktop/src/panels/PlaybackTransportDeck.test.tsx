import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PlaybackTransportDeck } from "./PlaybackTransportDeck";

afterEach(() => {
  cleanup();
});

function createRuntimeView() {
  return {
    status: "paused" as const,
    currentTimeSeconds: 0,
    timeScale: 1,
    canResume: true,
    blockReason: null,
    lastErrorMessage: null,
    lastBlockedAction: null,
    playbackMode: "realtime" as const,
    totalDurationSeconds: 40,
    preparingProgress: null,
    canSeek: false,
  };
}

function renderDeck() {
  render(
    <PlaybackTransportDeck
      currentTimeSeconds={0}
      isPreparing={false}
      mode="realtime"
      onModeChange={() => undefined}
      onPause={() => undefined}
      onPrecomputeDurationChange={() => undefined}
      onReset={() => undefined}
      onSeek={() => undefined}
      onStart={() => undefined}
      onStep={() => undefined}
      onTimeScaleChange={() => undefined}
      precomputeDurationSeconds={20}
      preparationProgress={0}
      realtimeCapSeconds={40}
      runtime={createRuntimeView()}
      seekEnabled={false}
      timelineMaxSeconds={40}
    />,
  );
}

describe("PlaybackTransportDeck", () => {
  it("renders compact top-row controls and keeps progress controls in a second row", () => {
    renderDeck();

    const deck = within(screen.getByTestId("playback-transport-deck"));
    const topRow = within(deck.getByTestId("transport-compact-row"));
    const progressRow = within(deck.getByTestId("transport-timeline-compact"));

    expect(topRow.getByRole("combobox", { name: /playback mode/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /start/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /pause/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /step/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /reset/i })).toBeDefined();
    expect(topRow.getByRole("combobox", { name: /speed/i })).toBeDefined();
    expect(progressRow.getByRole("slider", { name: /playback timeline/i })).toBeDefined();
    expect(progressRow.getByLabelText("Jump to time")).toBeDefined();
  });

  it("marks the progress row as left aligned and hides realtime helper copy", () => {
    renderDeck();

    expect(screen.getByTestId("transport-timeline-compact").getAttribute("data-align")).toBe("left");
    expect(screen.queryByText(/Realtime cap/i)).toBeNull();
  });

  it("rerenders live preparing progress through the compact transport shell", () => {
    const { rerender } = render(
      <PlaybackTransportDeck
        currentTimeSeconds={0}
        isPreparing
        mode="precomputed"
        onModeChange={() => undefined}
        onPause={() => undefined}
        onPrecomputeDurationChange={() => undefined}
        onReset={() => undefined}
        onSeek={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
        precomputeDurationSeconds={20}
        preparationProgress={0.1}
        realtimeCapSeconds={40}
        runtime={createRuntimeView()}
        seekEnabled={false}
        timelineMaxSeconds={20}
      />,
    );

    expect(screen.getByTestId("transport-compact-preparing-badge").textContent).toContain(
      "Preparing 10%",
    );
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDefined();

    rerender(
      <PlaybackTransportDeck
        currentTimeSeconds={0}
        isPreparing
        mode="precomputed"
        onModeChange={() => undefined}
        onPause={() => undefined}
        onPrecomputeDurationChange={() => undefined}
        onReset={() => undefined}
        onSeek={() => undefined}
        onStart={() => undefined}
        onStep={() => undefined}
        onTimeScaleChange={() => undefined}
        precomputeDurationSeconds={20}
        preparationProgress={0.45}
        realtimeCapSeconds={40}
        runtime={createRuntimeView()}
        seekEnabled={false}
        timelineMaxSeconds={20}
      />,
    );

    expect(screen.getByTestId("transport-compact-preparing-badge").textContent).toContain(
      "Preparing 45%",
    );
    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("45%");
  });
});
