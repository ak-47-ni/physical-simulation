import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createInitialEditorState } from "../state/editorStore";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

afterEach(() => {
  cleanup();
});

describe("WorkspaceCanvas", () => {
  it("mounts the center canvas and renders mock scene entities by id", () => {
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        entities={[
          { id: "ball-1", label: "Ball 1", x: 120, y: 180 },
          { id: "board-1", label: "Board 1", x: 320, y: 260 },
        ]}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("workspace-canvas")).toBeDefined();
    expect(screen.getByTestId("scene-entity-ball-1")).toBeDefined();
    expect(screen.getByTestId("scene-entity-board-1")).toBeDefined();
  });

  it("switches tool modes and toggles grid visibility", () => {
    const toolChanges: string[] = [];
    const gridChanges: boolean[] = [];
    const state = createInitialEditorState();

    const { rerender } = render(
      <WorkspaceCanvas
        entities={[]}
        state={state}
        onGridVisibleChange={(visible) => {
          gridChanges.push(visible);
        }}
        onSelectEntity={() => undefined}
        onToolChange={(tool) => {
          toolChanges.push(tool);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /pan tool/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide grid/i }));

    rerender(
      <WorkspaceCanvas
        entities={[]}
        state={{
          ...state,
          activeTool: "pan",
          gridVisible: false,
        }}
        onGridVisibleChange={(visible) => {
          gridChanges.push(visible);
        }}
        onSelectEntity={() => undefined}
        onToolChange={(tool) => {
          toolChanges.push(tool);
        }}
      />,
    );

    expect(toolChanges).toEqual(["pan"]);
    expect(gridChanges).toEqual([false]);
    expect(screen.getByTestId("workspace-canvas").getAttribute("data-tool")).toBe("pan");
    expect(screen.getByTestId("workspace-canvas").getAttribute("data-grid-visible")).toBe("false");
  });

  it("marks selected entities and notifies when a workspace entity is clicked", () => {
    const selectedEntityIds: string[] = [];
    const state = {
      ...createInitialEditorState(),
      selectedEntityId: "board-1",
    };

    render(
      <WorkspaceCanvas
        entities={[
          { id: "ball-1", label: "Ball 1", x: 120, y: 180 },
          { id: "board-1", label: "Board 1", x: 320, y: 260 },
        ]}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={(entityId) => {
          selectedEntityIds.push(entityId);
        }}
        onToolChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("scene-entity-board-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-entity-ball-1").getAttribute("data-selected")).toBe("false");

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));

    expect(selectedEntityIds).toEqual(["ball-1"]);
  });
});
