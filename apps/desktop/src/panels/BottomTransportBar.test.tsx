import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BottomTransportBar } from "./BottomTransportBar";

afterEach(() => {
  cleanup();
});

describe("BottomTransportBar", () => {
  it("renders transport controls, time-scale presets, and current simulation time", () => {
    render(
      <BottomTransportBar
        runtime={{
          status: "paused",
          currentTimeSeconds: 12.5,
          timeScale: 1,
          canResume: true,
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
        }}
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
    expect(screen.getByRole("button", { name: "0.25x" })).toBeDefined();
    expect(screen.getByRole("button", { name: "0.5x" })).toBeDefined();
    expect(screen.getByRole("button", { name: "1x" })).toBeDefined();
    expect(screen.getByRole("button", { name: "2x" })).toBeDefined();
    expect(screen.getByRole("button", { name: "4x" })).toBeDefined();
    expect(screen.getByText("12.50 s")).toBeDefined();
  });

  it("routes transport and time-scale actions through the runtime bridge interface", () => {
    const calls: string[] = [];

    render(
      <BottomTransportBar
        runtime={{
          status: "paused",
          currentTimeSeconds: 0,
          timeScale: 1,
          canResume: true,
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
        }}
        onPause={() => {
          calls.push("pause");
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
    fireEvent.click(screen.getByRole("button", { name: "2x" }));

    expect(calls).toEqual(["start", "pause", "step", "reset", "scale:2"]);
  });

  it("shows blocked-runtime guidance and disables actions that cannot run yet", () => {
    render(
      <BottomTransportBar
        runtime={{
          status: "paused",
          currentTimeSeconds: 0,
          timeScale: 1,
          canResume: false,
          blockReason: "rebuild-required",
          lastErrorMessage: null,
          lastBlockedAction: {
            action: "start",
            message: "Rebuild required before starting runtime.",
          },
        }}
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
        runtime={{
          status: "running",
          currentTimeSeconds: 1.25,
          timeScale: 1,
          canResume: true,
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
        }}
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
        runtime={{
          status: "paused",
          currentTimeSeconds: 1.25,
          timeScale: 1,
          canResume: true,
          blockReason: null,
          lastErrorMessage: null,
          lastBlockedAction: null,
        }}
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
});
