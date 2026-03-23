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

    const topRow = within(screen.getByTestId("playback-transport-top-row"));
    const progressRow = within(screen.getByTestId("playback-transport-progress-row"));

    expect(topRow.getByRole("combobox", { name: /playback mode/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /start/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /pause/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /step/i })).toBeDefined();
    expect(topRow.getByRole("button", { name: /reset/i })).toBeDefined();
    expect(topRow.getByRole("combobox", { name: /speed/i })).toBeDefined();
    expect(progressRow.getByLabelText("Playback progress")).toBeDefined();
    expect(progressRow.getByLabelText("Playback time")).toBeDefined();
  });

  it("marks the progress row as left aligned and hides realtime helper copy", () => {
    renderDeck();

    expect(screen.getByTestId("playback-transport-progress-row").getAttribute("data-align")).toBe(
      "left",
    );
    expect(screen.queryByText(/Realtime cap/i)).toBeNull();
  });
});
