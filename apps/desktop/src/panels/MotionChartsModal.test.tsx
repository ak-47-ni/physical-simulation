import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MotionChartsModal } from "./MotionChartsModal";

afterEach(() => {
  cleanup();
});

const samples = [
  {
    displacement: { x: 0, y: 0 },
    frameNumber: 0,
    position: { x: 1, y: 2 },
    speed: 2,
    timeSeconds: 0,
    velocity: { x: 2, y: 0 },
  },
  {
    displacement: { x: 1.5, y: -0.5 },
    frameNumber: 60,
    position: { x: 2.5, y: 1.5 },
    speed: Math.hypot(1, -2),
    timeSeconds: 1,
    velocity: { x: 1, y: -2 },
  },
];

describe("MotionChartsModal", () => {
  it("renders selected-object displacement and velocity component charts", () => {
    render(
      <MotionChartsModal
        entityLabel="Ball 1"
        lengthUnitLabel="m"
        samples={samples}
        velocityUnitLabel="m/s"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: /motion charts/i })).toBeDefined();
    expect(screen.getByText("Ball 1")).toBeDefined();
    expect(screen.getByText("Samples: 2")).toBeDefined();
    expect(screen.getByText("Latest Δx 1.50 m, Δy -0.50 m")).toBeDefined();
    expect(screen.getByText("Latest vx 1.00 m/s, vy -2.00 m/s")).toBeDefined();
    expect(screen.getByText("Absolute position: x 2.50 m, y 1.50 m")).toBeDefined();
    expect(screen.getByTestId("motion-chart-displacement").getAttribute("data-sample-count")).toBe(
      "2",
    );
    expect(screen.getByTestId("motion-chart-velocity").getAttribute("data-sample-count")).toBe("2");
  });

  it("renders axis tick labels with time and metric units on both charts", () => {
    render(
      <MotionChartsModal
        entityLabel="Ball 1"
        lengthUnitLabel="m"
        samples={samples}
        velocityUnitLabel="m/s"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByTestId("motion-chart-displacement-x-tick-0").textContent).toBe("0.00 s");
    expect(screen.getByTestId("motion-chart-displacement-x-tick-1").textContent).toBe("0.50 s");
    expect(screen.getByTestId("motion-chart-displacement-x-tick-2").textContent).toBe("1.00 s");
    expect(screen.getByTestId("motion-chart-displacement-y-tick-0").textContent).toContain("m");
    expect(screen.getByTestId("motion-chart-displacement-y-tick-4").textContent).toContain("m");
    expect(screen.getByTestId("motion-chart-velocity-x-tick-0").textContent).toBe("0.00 s");
    expect(screen.getByTestId("motion-chart-velocity-x-tick-2").textContent).toBe("1.00 s");
    expect(screen.getByTestId("motion-chart-velocity-y-tick-0").textContent).toContain("m/s");
    expect(screen.getByTestId("motion-chart-velocity-y-tick-4").textContent).toContain("m/s");
  });

  it("renders fixed zero axes on both motion charts", () => {
    render(
      <MotionChartsModal
        entityLabel="Ball 1"
        lengthUnitLabel="m"
        samples={samples}
        velocityUnitLabel="m/s"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByTestId("motion-chart-displacement-zero-time-axis")).toBeDefined();
    expect(screen.getByTestId("motion-chart-displacement-zero-value-axis")).toBeDefined();
    expect(screen.getByTestId("motion-chart-displacement-zero-time-label").textContent).toBe(
      "0.00 s",
    );
    expect(screen.getByTestId("motion-chart-displacement-zero-value-label").textContent).toBe(
      "0.00 m",
    );
    expect(screen.getByTestId("motion-chart-velocity-zero-time-axis")).toBeDefined();
    expect(screen.getByTestId("motion-chart-velocity-zero-value-axis")).toBeDefined();
  });

  it("shows interpolated chart values while hovering over a chart", () => {
    render(
      <MotionChartsModal
        entityLabel="Ball 1"
        lengthUnitLabel="m"
        samples={samples}
        velocityUnitLabel="m/s"
        onClose={() => undefined}
      />,
    );

    const chart = screen.getByTestId("motion-chart-displacement");
    Object.defineProperty(chart, "getBoundingClientRect", {
      value: () =>
        ({
          bottom: 184,
          height: 184,
          left: 0,
          right: 620,
          top: 0,
          width: 620,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        }) as DOMRect,
    });

    fireEvent.mouseMove(chart, { clientX: 332, clientY: 82 });

    const readout = screen.getByTestId("motion-chart-displacement-hover-readout");
    expect(readout.textContent).toContain("t 0.50 s");
    expect(readout.textContent).toContain("Δx 0.75 m");
    expect(readout.textContent).toContain("Δy -0.25 m");

    fireEvent.mouseLeave(chart);

    expect(screen.queryByTestId("motion-chart-displacement-hover-readout")).toBeNull();
  });

  it("closes from the modal close action", () => {
    let closeCount = 0;

    render(
      <MotionChartsModal
        entityLabel="Ball 1"
        lengthUnitLabel="m"
        samples={samples}
        velocityUnitLabel="m/s"
        onClose={() => {
          closeCount += 1;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /close motion charts/i }));

    expect(closeCount).toBe(1);
  });
});
