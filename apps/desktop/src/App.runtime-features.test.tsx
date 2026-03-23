import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App runtime features", () => {
  it("mounts the transport bar, analysis panel, and annotation layer into the desktop shell", () => {
    render(<App />);

    expect(screen.getByTestId("bottom-transport-bar")).toBeDefined();
    expect(screen.getByTestId("analysis-panel")).toBeDefined();
    expect(screen.getByTestId("annotation-layer")).toBeDefined();
  });

  it("routes transport controls through app runtime state", () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    expect(screen.getByText("0.00 s")).toBeDefined();
    expect(screen.getByText("State: idle")).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: "2x" }));
    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    expect(screen.getByText("0.03 s")).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));
    expect(screen.getByText("State: running")).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    expect(screen.getByText("State: paused")).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: /^reset$/i }));
    expect(screen.getByText("0.00 s")).toBeDefined();
    expect(screen.getByText("State: idle")).toBeDefined();
    expect(transport.getByRole("button", { name: "1x" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("syncs analysis overlay toggles back into app display state", () => {
    render(<App />);

    expect((screen.getByLabelText("Show trajectories") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));

    expect((screen.getByLabelText("Show trajectories") as HTMLInputElement).checked).toBe(true);
  });

  it("syncs annotation visibility through app state", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /hide annotations/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-visible")).toBe("false");
  });

  it("shows runtime analysis guidance before samples and updates the summary after stepping", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    await waitFor(() => {
      expect(screen.getByText("Tracked entity: ball-1")).toBeDefined();
      expect(screen.getByText("Runtime sample count: 0")).toBeDefined();
      expect(
        screen.getByText("No runtime samples yet. Start or step the runtime to collect data."),
      ).toBeDefined();
    });

    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect(screen.getByText("Tracked entity: ball-1")).toBeDefined();
      expect(screen.getByText("Runtime sample count: 1")).toBeDefined();
    });
  });

  it("projects runtime step positions back into the workspace", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "60" } });

    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");

    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    });
  });

  it("falls back to authored workspace positions after resetting the runtime", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "60" } });
    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");
    });
  });
});
