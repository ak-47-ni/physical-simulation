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
});
