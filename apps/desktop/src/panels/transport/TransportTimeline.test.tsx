import type { ComponentType } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TransportTimeline } from "./TransportTimeline";

afterEach(() => {
  cleanup();
});

const CompactTransportTimeline = TransportTimeline as ComponentType<Record<string, unknown>>;

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

  it("updates visible preparing progress across rerenders without collapsing the compact timeline", () => {
    const { rerender } = render(
      <CompactTransportTimeline
        layout="compact"
        progress={createProgress({
          totalDurationSeconds: 20,
          preparingProgress: 0.1,
          status: "preparing",
          canSeek: false,
        })}
      />,
    );

    expect(screen.getByTestId("transport-timeline-compact")).toBeDefined();
    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("10%");
    expect(
      (screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled,
    ).toBe(true);

    rerender(
      <CompactTransportTimeline
        layout="compact"
        progress={createProgress({
          totalDurationSeconds: 20,
          preparingProgress: 0.45,
          status: "preparing",
          canSeek: false,
        })}
      />,
    );

    expect(screen.getByTestId("transport-timeline-compact")).toBeDefined();
    expect(screen.getByTestId("transport-preparing-progress").textContent).toContain("45%");
    expect((screen.getByLabelText("Jump to time") as HTMLInputElement).disabled).toBe(true);
  });

  it("routes slider drag input events and direct time commits to the seek callback", () => {
    const calls: number[] = [];

    render(
      <CompactTransportTimeline
        layout="compact"
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

    fireEvent.input(screen.getByRole("slider", { name: /playback timeline/i }), {
      target: { value: "4.5" },
    });
    fireEvent.change(screen.getByLabelText("Jump to time"), {
      target: { value: "4" },
    });
    fireEvent.blur(screen.getByLabelText("Jump to time"));
    fireEvent.change(screen.getByLabelText("Jump to time"), {
      target: { value: "6" },
    });
    fireEvent.keyDown(screen.getByLabelText("Jump to time"), {
      key: "Enter",
    });

    expect(calls).toEqual([4.5, 4, 6]);
  });

  it("renders a stable compact container for a left-aligned progress row", () => {
    render(
      <CompactTransportTimeline
        layout="compact"
        progress={createProgress({
          currentTimeSeconds: 2.5,
          totalDurationSeconds: 20,
          canSeek: true,
          status: "paused",
        })}
      />,
    );

    expect(screen.getByTestId("transport-timeline-compact")).toBeDefined();
    expect(screen.getByTestId("transport-timeline-compact-row")).toBeDefined();
  });
});
