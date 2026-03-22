import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnalysisPanel } from "./AnalysisPanel";

afterEach(() => {
  cleanup();
});

describe("AnalysisPanel", () => {
  it("toggles trajectory, vector overlays, and chart visibility", () => {
    render(<AnalysisPanel />);

    expect(screen.queryByTestId("trajectory-overlay")).toBeNull();
    expect(screen.queryByTestId("velocity-vector-overlay")).toBeNull();
    expect(screen.queryByTestId("force-vector-overlay")).toBeNull();
    expect(screen.queryByTestId("analysis-chart-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));
    fireEvent.click(screen.getByRole("button", { name: /show velocity vectors/i }));
    fireEvent.click(screen.getByRole("button", { name: /show force vectors/i }));
    fireEvent.click(screen.getByRole("button", { name: /open chart panel/i }));

    expect(screen.getByTestId("trajectory-overlay")).toBeDefined();
    expect(screen.getByTestId("velocity-vector-overlay")).toBeDefined();
    expect(screen.getByTestId("force-vector-overlay")).toBeDefined();
    expect(screen.getByTestId("analysis-chart-panel")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /close chart panel/i }));

    expect(screen.queryByTestId("analysis-chart-panel")).toBeNull();
  });

  it("accepts analyzer samples into the panel state", () => {
    render(<AnalysisPanel />);

    fireEvent.change(screen.getByLabelText(/sample label/i), {
      target: { value: "Probe A" },
    });
    fireEvent.change(screen.getByLabelText(/sample value/i), {
      target: { value: "9.81" },
    });
    fireEvent.change(screen.getByLabelText(/sample unit/i), {
      target: { value: "m/s^2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accept sample/i }));

    expect(screen.getByText("Probe A")).toBeDefined();
    expect(screen.getByText("9.81 m/s^2")).toBeDefined();
  });

  it("supports controlled overlay display state updates", () => {
    const displayChanges: Array<{
      showTrajectories: boolean;
      showVelocityVectors: boolean;
      showForceVectors: boolean;
    }> = [];

    const { rerender } = render(
      <AnalysisPanel
        display={{
          showTrajectories: false,
          showVelocityVectors: false,
          showForceVectors: false,
        }}
        onDisplayChange={(nextDisplay) => {
          displayChanges.push(nextDisplay);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));
    fireEvent.click(screen.getByRole("button", { name: /show velocity vectors/i }));
    fireEvent.click(screen.getByRole("button", { name: /show force vectors/i }));

    expect(displayChanges).toEqual([
      {
        showTrajectories: true,
        showVelocityVectors: false,
        showForceVectors: false,
      },
      {
        showTrajectories: false,
        showVelocityVectors: true,
        showForceVectors: false,
      },
      {
        showTrajectories: false,
        showVelocityVectors: false,
        showForceVectors: true,
      },
    ]);

    rerender(
      <AnalysisPanel
        display={{
          showTrajectories: true,
          showVelocityVectors: true,
          showForceVectors: true,
        }}
        onDisplayChange={(nextDisplay) => {
          displayChanges.push(nextDisplay);
        }}
      />,
    );

    expect(screen.getByTestId("trajectory-overlay")).toBeDefined();
    expect(screen.getByTestId("velocity-vector-overlay")).toBeDefined();
    expect(screen.getByTestId("force-vector-overlay")).toBeDefined();
  });
});
