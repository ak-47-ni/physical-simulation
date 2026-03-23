import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App runtime features", () => {
  it("mounts scene physics controls with SI defaults and classroom world scale", () => {
    render(<App />);

    expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("9.8");
    expect(screen.getByText("m/s²")).toBeDefined();
    expect((screen.getByLabelText("Length unit") as HTMLSelectElement).value).toBe("m");
    expect((screen.getByLabelText("Velocity unit") as HTMLSelectElement).value).toBe("m/s");
    expect((screen.getByLabelText("Mass unit") as HTMLSelectElement).value).toBe("kg");
    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).value).toBe("100");
  });

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
    expect(
      screen.getByText("Runtime is playing. Pause to inspect the current motion."),
    ).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    expect(screen.getByText("Runtime is paused on the current frame.")).toBeDefined();

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
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

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
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });
    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");
    });
  });

  it("continues advancing workspace positions after starting runtime", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    expect(ball.style.left).toBe("132px");

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    const firstRunningPosition = ball.style.left;

    await waitFor(() => {
      expect(ball.style.left).not.toBe(firstRunningPosition);
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
  });

  it("freezes the visible runtime position after pausing playback", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));

    const pausedPosition = ball.style.left;

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 80);
    });

    expect(ball.style.left).toBe(pausedPosition);
  });

  it("restores the authored workspace position after resetting from playback", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect(ball.style.left).toBe("132px");
      expect(ball.style.top).toBe("176px");
    });
  });

  it("recompiles from frame zero after changing gravity while paused", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.top).not.toBe("176px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));

    const pausedTop = ball.style.top;

    expect(pausedTop).not.toBe("176px");

    fireEvent.change(screen.getByLabelText("Gravity"), { target: { value: "12.5" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect(screen.getByText("State: idle")).toBeDefined();
      expect(ball.style.left).toBe("132px");
      expect(ball.style.top).toBe("176px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.top).not.toBe("176px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
  });

  it("converts authored values and clears visible runtime state after changing units while paused", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("1.32");
    expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("0.6");

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.change(screen.getByLabelText("Length unit"), { target: { value: "cm" } });
    fireEvent.change(screen.getByLabelText("Velocity unit"), { target: { value: "cm/s" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect(screen.getByText("State: idle")).toBeDefined();
      expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("980");
      expect(screen.getByText("cm/s²")).toBeDefined();
      expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("132");
      expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("60");
      expect(ball.style.left).toBe("132px");
    });

    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect(ball.style.left).toBe("133px");
    });
  });

  it("mounts the transport controls above the workspace and keeps analysis in the bottom pane", () => {
    render(<App />);

    const centerPane = screen.getByTestId("shell-center-pane");
    const bottomPane = screen.getByTestId("shell-bottom-pane");

    expect(within(centerPane).getByTestId("bottom-transport-bar")).toBeDefined();
    expect(within(centerPane).getByTestId("workspace-canvas")).toBeDefined();
    expect(within(bottomPane).queryByTestId("bottom-transport-bar")).toBeNull();
    expect(within(bottomPane).getByTestId("analysis-panel")).toBeDefined();
  });

  it("defaults to realtime playback with a 40 second cap and disabled seek controls", () => {
    render(<App />);

    expect((screen.getByLabelText("Playback mode") as HTMLSelectElement).value).toBe("realtime");
    expect(screen.getAllByText("Realtime cap: 40 s").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Playback progress") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Playback time") as HTMLInputElement).disabled).toBe(true);
  });

  it("precomputes cached playback and seeks by timeline and time input", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("Playback mode"), { target: { value: "precomputed" } });

    expect((screen.getByLabelText("Precompute duration") as HTMLInputElement).value).toBe("20");

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect((screen.getByLabelText("Playback progress") as HTMLInputElement).disabled).toBe(
        false,
      );
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.change(screen.getByLabelText("Playback progress"), { target: { value: "0.5" } });

    await waitFor(() => {
      expect(screen.getByText("0.50 s")).toBeDefined();
      expect(ball.style.left).toBe("162px");
    });

    fireEvent.change(screen.getByLabelText("Playback time"), { target: { value: "0.25" } });

    await waitFor(() => {
      expect(screen.getByText("0.25 s")).toBeDefined();
      expect(ball.style.left).toBe("147px");
    });
  });

  it("resets cached playback to time zero after changing duration while paused", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("Playback mode"), { target: { value: "precomputed" } });
    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));

    await waitFor(() => {
      expect((screen.getByLabelText("Playback progress") as HTMLInputElement).disabled).toBe(
        false,
      );
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.change(screen.getByLabelText("Playback progress"), { target: { value: "0.5" } });

    await waitFor(() => {
      expect(ball.style.left).toBe("162px");
    });

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "2" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect(ball.style.left).toBe("132px");
    });
  });
});
