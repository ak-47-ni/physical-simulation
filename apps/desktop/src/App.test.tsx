import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("updates entity label and dimensions from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.change(screen.getByLabelText("Entity name"), { target: { value: "Ramp" } });
    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "148" } });
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "24" } });

    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;
    const sceneTreeItem = screen.getByTestId("scene-tree-item-board-1");

    expect(board.textContent).toBe("Ramp");
    expect(board.style.width).toBe("148px");
    expect(board.style.height).toBe("24px");
    expect(sceneTreeItem.textContent).toBe("Ramp");
  });

  it("updates ball radius from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "30" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    expect(ball.style.width).toBe("60px");
    expect(ball.style.height).toBe("60px");
  });

  it("updates physics properties and locked markers from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.change(screen.getByLabelText("Mass"), { target: { value: "7.5" } });
    fireEvent.change(screen.getByLabelText("Friction"), { target: { value: "0.58" } });
    fireEvent.change(screen.getByLabelText("Restitution"), { target: { value: "0.24" } });
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "-6" } });
    fireEvent.click(screen.getByLabelText("Locked in simulation"));

    expect((screen.getByLabelText("Mass") as HTMLInputElement).value).toBe("7.5");
    expect((screen.getByLabelText("Friction") as HTMLInputElement).value).toBe("0.58");
    expect((screen.getByLabelText("Restitution") as HTMLInputElement).value).toBe("0.24");
    expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("Velocity Y") as HTMLInputElement).value).toBe("-6");
    expect((screen.getByLabelText("Locked in simulation") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("scene-entity-lock-board-1")).toBeDefined();
  });

  it("updates display toggles from the property panel and workspace toolbar", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "-6" } });
    fireEvent.click(screen.getByLabelText("Show labels"));
    fireEvent.click(screen.getByLabelText("Show velocity vectors"));
    fireEvent.click(screen.getByLabelText("Show force vectors"));

    expect(screen.getByTestId("scene-entity-ball-1").textContent).toBe("");
    expect(screen.getByTestId("scene-velocity-vector-ball-1")).toBeDefined();
    expect(screen.getByTestId("scene-force-vector-ball-1")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /hide grid/i }));

    expect(screen.getByTestId("workspace-canvas").getAttribute("data-grid-visible")).toBe("false");
    expect((screen.getByLabelText("Show grid") as HTMLInputElement).checked).toBe(false);
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

  it("deletes the selected entity from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(screen.queryByTestId("scene-entity-board-1")).toBeNull();
    expect(screen.queryByTestId("scene-tree-item-board-1")).toBeNull();
    expect(screen.getByText("No entity selected")).toBeDefined();
  });

  it("duplicates the selected entity from the property panel", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.click(screen.getByRole("button", { name: /duplicate entity/i }));

    expect(screen.getByTestId("scene-entity-board-2")).toBeDefined();
    expect(screen.getByTestId("scene-tree-item-board-2").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("342, 296")).toBeDefined();
  });

  it("preserves edited physics properties when duplicating an entity", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.change(screen.getByLabelText("Mass"), { target: { value: "6.4" } });
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "15" } });
    fireEvent.click(screen.getByLabelText("Locked in simulation"));
    fireEvent.click(screen.getByRole("button", { name: /duplicate entity/i }));

    expect(screen.getByTestId("scene-entity-board-2")).toBeDefined();
    expect((screen.getByLabelText("Mass") as HTMLInputElement).value).toBe("6.4");
    expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("15");
    expect((screen.getByLabelText("Locked in simulation") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("scene-entity-lock-board-2")).toBeDefined();
  });

  it("supports keyboard shortcuts for duplicate and delete", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.keyDown(window, { ctrlKey: true, key: "d" });

    expect(screen.getByTestId("scene-entity-board-2")).toBeDefined();
    expect(screen.getByText("342, 296")).toBeDefined();

    fireEvent.keyDown(window, { key: "Delete" });

    expect(screen.queryByTestId("scene-entity-board-2")).toBeNull();
    expect(screen.queryByTestId("scene-tree-item-board-2")).toBeNull();
    expect(screen.getByText("No entity selected")).toBeDefined();
  });

  it("creates a spring constraint from two entity picks", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Spring" }));

    expect(screen.getByTestId("workspace-canvas").getAttribute("data-tool")).toBe(
      "place-constraint",
    );
    expect(screen.getByText("Select first body for the spring")).toBeDefined();

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.click(screen.getByTestId("scene-entity-board-1"));

    expect(screen.getByTestId("scene-constraint-spring-spring-1")).toBeDefined();
    expect(screen.getByTestId("scene-constraint-spring-spring-1").getAttribute("data-rest-length")).toBe(
      "236",
    );
  });

  it("creates a track constraint from an entity pick and a workspace point", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Track" }));
    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 312, clientY: 248 });

    expect(screen.getByTestId("scene-constraint-track-track-1")).toBeDefined();
  });

  it("cancels in-progress constraint placement without creating a constraint", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Spring" }));
    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.click(screen.getByRole("button", { name: /cancel placement/i }));

    expect(screen.queryByTestId("scene-constraint-spring-spring-1")).toBeNull();
    expect(screen.getByTestId("workspace-canvas").getAttribute("data-tool")).toBe("select");
    expect(screen.queryByText("Select second body for the spring")).toBeNull();
  });

  it("deletes a selected constraint and clears the selection state", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Spring" }));
    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.click(screen.getByTestId("scene-entity-board-1"));
    fireEvent.click(screen.getByTestId("scene-tree-constraint-spring-1"));

    expect(screen.getByLabelText("Rest length")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /delete constraint/i }));

    expect(screen.queryByTestId("scene-constraint-spring-spring-1")).toBeNull();
    expect(screen.queryByTestId("scene-tree-constraint-spring-1")).toBeNull();
    expect(screen.getByText("No entity selected")).toBeDefined();
  });

  it("keeps entity selection synced while runtime projection is active", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "60" } });
    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
      expect(screen.getByTestId("scene-entity-ball-1").getAttribute("data-selected")).toBe("true");
      expect(screen.getByTestId("scene-tree-item-ball-1").getAttribute("data-selected")).toBe(
        "true",
      );
    });
  });

  it("blocks dragging and shows a workspace hint while the runtime is running", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));
    fireEvent.mouseDown(screen.getByTestId("scene-entity-ball-1"), { clientX: 132, clientY: 176 });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 228 });
    fireEvent.mouseUp(window);

    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");
    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.top).toBe("176px");
    expect(
      screen.getByText("Playback running. Move, placement, and constraint editing are temporarily locked."),
    ).toBeDefined();

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
  });

  it("blocks placement but still allows selection while the runtime is running", async () => {
    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByRole("button", { name: /place body tool/i }));
    fireEvent.click(transport.getByRole("button", { name: /^start$/i }));
    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 248, clientY: 204 });
    fireEvent.click(screen.getByTestId("scene-entity-board-1"));

    expect(screen.queryByTestId("scene-entity-ball-2")).toBeNull();
    expect(screen.getByTestId("scene-entity-board-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-tree-item-board-1").getAttribute("data-selected")).toBe(
      "true",
    );

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
  });
});
