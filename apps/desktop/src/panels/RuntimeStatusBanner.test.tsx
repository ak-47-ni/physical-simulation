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

  it("shows a rebuild-required hint before a blocked resume attempt", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "paused",
          blockReason: "rebuild-required",
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "realtime",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rebuild required before starting runtime.",
    );
  });

  it("shows a classroom-friendly running explanation while the runtime is active", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "running",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "realtime",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Runtime is playing. Motion and live samples should keep updating.",
    );
  });

  it("shows a paused explanation after the teacher stops playback", () => {
    render(
      <RuntimeStatusBanner
        runtime={{
          status: "paused",
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
          playbackMode: "realtime",
          canSeek: false,
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Runtime is paused. Use Step for one frame or Start to continue.",
    );
  });

  it("shows cached-playback preparation guidance while frames are building", () => {
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
      "Preparing cached playback. Frames are being built before scrubbing unlocks.",
    );
  });
});
