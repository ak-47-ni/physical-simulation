import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App selection sync", () => {
  it("synchronizes selection across scene tree, workspace, and property panel", () => {
    render(<App />);

    expect(screen.getByText("No entity selected")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Board 1" }));

    expect(screen.getByText("318, 272")).toBeDefined();
    expect(screen.getByTestId("scene-entity-board-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-tree-item-board-1").getAttribute("data-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));

    expect(screen.getByTestId("scene-entity-ball-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-tree-item-ball-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("132, 176")).toBeDefined();
  });

  it("updates entity positions after dragging in the workspace", () => {
    render(<App />);

    fireEvent.mouseDown(screen.getByTestId("scene-entity-ball-1"), { clientX: 132, clientY: 176 });
    fireEvent.mouseMove(window, { clientX: 168, clientY: 220 });
    fireEvent.mouseUp(window);

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    expect(ball.style.left).toBe("168px");
    expect(ball.style.top).toBe("220px");
    expect(screen.getByText("168, 220")).toBeDefined();
  });

  it("updates entity positions from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "340" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "290" } });

    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;

    expect(board.style.left).toBe("340px");
    expect(board.style.top).toBe("290px");
    expect(screen.getByText("340, 290")).toBeDefined();
  });

  it("creates and selects a new body from place-body mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /place body tool/i }));
    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 248, clientY: 204 });

    expect(screen.getByTestId("scene-entity-ball-2")).toBeDefined();
    expect(screen.getByTestId("scene-tree-item-ball-2").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("248, 204")).toBeDefined();
  });

  it("creates the selected library body kind when placing", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 280, clientY: 236 });

    expect(screen.getByTestId("scene-entity-board-2")).toBeDefined();
    expect(screen.getByTestId("scene-tree-item-board-2").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("280, 236")).toBeDefined();
  });
});
