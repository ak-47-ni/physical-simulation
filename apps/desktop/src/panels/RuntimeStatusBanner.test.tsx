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
        }}
      />,
    );

    expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
      "Rebuild required before starting runtime.",
    );
  });
});
