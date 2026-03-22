import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByText("0.00 s")).toBeDefined();
    expect(screen.getByText("State: idle")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    fireEvent.click(screen.getByRole("button", { name: /step/i }));

    expect(screen.getByText("0.03 s")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    expect(screen.getByText("State: running")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(screen.getByText("State: paused")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByText("0.00 s")).toBeDefined();
    expect(screen.getByText("State: idle")).toBeDefined();
    expect(screen.getByRole("button", { name: "1x" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("syncs analysis overlay toggles back into app display state", () => {
    render(<App />);

    const trajectoriesLabel = screen.getByText("Trajectories");

    expect(trajectoriesLabel.nextSibling?.textContent).toBe("Off");

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));

    expect(trajectoriesLabel.nextSibling?.textContent).toBe("On");
  });

  it("syncs annotation visibility through app state", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /hide annotations/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-visible")).toBe("false");
  });
});
