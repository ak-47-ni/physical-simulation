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

  it("groups accepted samples by metric and switches the chart metric view", () => {
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByRole("button", { name: /open chart panel/i }));

    expect(screen.getByText("Selected metric: displacement")).toBeDefined();
    expect(screen.getByText("Samples in view: 0")).toBeDefined();

    fireEvent.change(screen.getByLabelText(/sample metric/i), {
      target: { value: "velocity" },
    });
    fireEvent.change(screen.getByLabelText(/sample label/i), {
      target: { value: "Probe V1" },
    });
    fireEvent.change(screen.getByLabelText(/sample value/i), {
      target: { value: "3.8" },
    });
    fireEvent.change(screen.getByLabelText(/sample unit/i), {
      target: { value: "m/s" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accept sample/i }));

    fireEvent.change(screen.getByLabelText(/sample metric/i), {
      target: { value: "velocity" },
    });
    fireEvent.change(screen.getByLabelText(/sample label/i), {
      target: { value: "Probe V" },
    });
    fireEvent.change(screen.getByLabelText(/sample value/i), {
      target: { value: "4.2" },
    });
    fireEvent.change(screen.getByLabelText(/sample unit/i), {
      target: { value: "m/s" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accept sample/i }));

    fireEvent.change(screen.getByLabelText(/sample metric/i), {
      target: { value: "energy" },
    });
    fireEvent.change(screen.getByLabelText(/sample label/i), {
      target: { value: "Probe E" },
    });
    fireEvent.change(screen.getByLabelText(/sample value/i), {
      target: { value: "12.4" },
    });
    fireEvent.change(screen.getByLabelText(/sample unit/i), {
      target: { value: "J" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accept sample/i }));

    expect(screen.getByText("Velocity samples (2)")).toBeDefined();
    expect(screen.getByText("Energy samples (1)")).toBeDefined();
    expect(screen.getByText("Probe V1")).toBeDefined();
    expect(screen.getByText("Probe V")).toBeDefined();
    expect(screen.getByText("Probe E")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /view velocity chart/i }));

    expect(screen.getByText("Velocity overview")).toBeDefined();
    expect(screen.getByText("Latest: 4.2 m/s")).toBeDefined();
    expect(screen.getByText("Range: 3.8 to 4.2 m/s")).toBeDefined();
    expect(screen.getByText("Selected metric: velocity")).toBeDefined();
    expect(screen.getByText("Samples in view: 2")).toBeDefined();
    expect(screen.getByText("Latest sample: 4.2 m/s")).toBeDefined();
    expect(screen.getByText("Series points: 2")).toBeDefined();
    expect(screen.getByText("Key points")).toBeDefined();
    expect(screen.getByText("Point 1")).toBeDefined();
    expect(screen.getByText("Delta baseline")).toBeDefined();
    expect(screen.getByText("+0.4 m/s")).toBeDefined();
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
