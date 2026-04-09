import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RuntimeStatusBanner } from "./RuntimeStatusBanner";

afterEach(() => {
  cleanup();
});

describe("RuntimeStatusBanner", () => {
  it("renders compile failures and hides itself again after the runtime is healthy", () => {
    const { rerender } = render(
      <RuntimeStatusBanner
        runtime={{
          status: "paused",
          blockReason: null,
          lastErrorMessage: "compile failed: spring endpoint missing",
          lastBlockedAction: null,
          playbackMode: "realtime",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "compile failed: spring endpoint missing",
    );

    rerender(
      <RuntimeStatusBanner
        runtime={{
          status: "idle",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "realtime",
          canSeek: false,
        }}
      />,
    );

    expect(screen.queryByTestId("runtime-status-banner")).toBeNull();
  });

  it("shows stale-result guidance before recalculation", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "paused",
          blockReason: "rebuild-required",
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "precomputed",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Results are out of date. Recalculate to review the latest motion.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rigid collisions stay elastic; friction only changes sliding.",
    );
  });

  it("shows a calculate-first running explanation while the result is playing", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "running",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "precomputed",
          canSeek: true,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Showing the calculated result. Pause to inspect or jump to another time.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rigid collisions stay elastic; friction only changes sliding.",
    );
  });

  it("shows an uncomputed explanation before the first calculation", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "idle",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "precomputed",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Calculate a result to enable play, seek, and time jump.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rigid collisions stay elastic; friction only changes sliding.",
    );
  });

  it("shows calculate-first preparation guidance while frames are building", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "preparing",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "precomputed",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Calculating the result. Playback and time jump unlock when it finishes.",
    );
    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rigid collisions stay elastic; friction only changes sliding.",
    );
  });
});
