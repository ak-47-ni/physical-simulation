import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TransportTimeline } from "./TransportTimeline";

afterEach(() => {
  cleanup();
});

function createProgress(overrides: {
  currentTimeSeconds?: number;
  totalDurationSeconds?: number;
  canSeek?: boolean;
  preparingProgress?: number | null;
  status?: "idle" | "preparing" | "running" | "paused";
} = {}) {
  return {
    currentTimeSeconds: 0,
    totalDurationSeconds: 40,
    canSeek: false,
    preparingProgress: null,
    status: "paused" as const,
    ...overrides,
  };
}

describe("TransportTimeline", () => {
  it("shows a fixed realtime duration cap and disables seek controls until cached playback is ready", () => {
    render(
      <TransportTimeline
        progress={createProgress({
          currentTimeSeconds: 12.5,
          totalDurationSeconds: 40,
          canSeek: false,
          status: "running",
        })}
      />,
    );

    expect(screen.getByText("12.50 / 40.00 s")).toBeDefined();
    expect(
      (screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Jump to time") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows preparing progress while frames are being cached", () => {
    render(
      <TransportTimeline
        progress={createProgress({
          totalDurationSeconds: 20,
          preparingProgress: 0.35,
          status: "preparing",
        })}
      />,
    );

    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("35%");
  });

  it("routes timeline drags and direct time input to the seek callback", () => {
    const calls: number[] = [];

    render(
      <TransportTimeline
        progress={createProgress({
          currentTimeSeconds: 2.5,
          totalDurationSeconds: 20,
          canSeek: true,
          status: "paused",
        })}
        onSeek={(timeSeconds) => {
          calls.push(timeSeconds);
        }}
      />,
    );

    fireEvent.change(screen.getByRole("slider", { name: /playback timeline/i }), {
      target: { value: "4.5" },
    });
    fireEvent.change(screen.getByLabelText("Jump to time"), {
      target: { value: "4" },
    });
    fireEvent.blur(screen.getByLabelText("Jump to time"));

    expect(calls).toEqual([4.5, 4]);
  });
});
