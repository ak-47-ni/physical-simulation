import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createSceneDisplaySettings } from "../io/sceneFile";
import { createInitialEditorState } from "../state/editorStore";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

afterEach(() => {
  cleanup();
});

function createDisplaySettings(overrides: Parameters<typeof createSceneDisplaySettings>[0] = {}) {
  return createSceneDisplaySettings({
    gridVisible: true,
    showLabels: true,
    showTrajectories: false,
    showForceVectors: false,
    showVelocityVectors: false,
    ...overrides,
  });
}

describe("WorkspaceCanvas", () => {
  it("mounts the center canvas and renders mock scene entities by id", () => {
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 120,
            height: 18,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
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
        display={createDisplaySettings()}
        entities={[]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
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
        display={createDisplaySettings({
          gridVisible: false,
        })}
        entities={[]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
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
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 120,
            height: 18,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
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

  it("reports updated entity positions while dragging in select mode", () => {
    const moves: Array<{ id: string; x: number; y: number }> = [];
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={(id, position) => {
          moves.push({ id, ...position });
        }}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId("scene-entity-ball-1"), { clientX: 120, clientY: 180 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 222 });
    fireEvent.mouseUp(window);

    expect(moves).toEqual([{ id: "ball-1", x: 150, y: 222 }]);
  });

  it("renders entity geometry with the configured dimensions", () => {
    const state = {
      ...createInitialEditorState(),
      selectedEntityId: "ball-1",
    };

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 30,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 148,
            height: 24,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: true,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;
    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;

    expect(ball.style.width).toBe("60px");
    expect(ball.style.height).toBe("60px");
    expect(ball.style.borderRadius).toBe("999px");
    expect(board.style.width).toBe("148px");
    expect(board.style.height).toBe("24px");
    expect(board.getAttribute("data-locked")).toBe("true");
    expect(screen.getByTestId("scene-entity-lock-board-1")).toBeDefined();
  });

  it("shows no lock marker for movable entities", () => {
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        entities={[
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 148,
            height: 24,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;

    expect(board.getAttribute("data-locked")).toBe("false");
    expect(screen.queryByTestId("scene-entity-lock-board-1")).toBeNull();
  });

  it("renders labels and teaching vectors according to display settings", () => {
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings({
          showForceVectors: true,
          showLabels: false,
          showVelocityVectors: true,
        })}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 12,
            velocityY: -6,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 148,
            height: 24,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: true,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    expect(screen.queryByText("Ball 1")).toBeNull();
    expect(screen.getByTestId("scene-velocity-vector-ball-1")).toBeDefined();
    expect(screen.getByTestId("scene-force-vector-ball-1")).toBeDefined();
    expect(screen.queryByTestId("scene-force-vector-board-1")).toBeNull();
  });

  it("creates a new entity when place-body mode clicks the workspace stage", () => {
    const created: Array<{ x: number; y: number }> = [];

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        entities={[]}
        onCreateEntity={(position) => {
          created.push(position);
        }}
        onMoveEntity={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-body",
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 248, clientY: 204 });

    expect(created).toEqual([{ x: 248, y: 204 }]);
  });

  it("routes entity picks and stage picks through constraint placement callbacks", () => {
    const entityPicks: string[] = [];
    const pointPicks: Array<{ x: number; y: number }> = [];
    const selectedEntityIds: string[] = [];
    const { rerender } = render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: null,
          hint: "Select first body for the spring",
          kind: "spring",
          mode: "pick-entity",
        }}
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onPlaceConstraintEntity={(entityId) => {
          entityPicks.push(entityId);
        }}
        onPlaceConstraintPoint={(position) => {
          pointPicks.push(position);
        }}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={(entityId) => {
          selectedEntityIds.push(entityId);
        }}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));

    rerender(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: "ball-1",
          hint: "Pick a point to define the track axis",
          kind: "track",
          mode: "pick-point",
        }}
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onPlaceConstraintEntity={(entityId) => {
          entityPicks.push(entityId);
        }}
        onPlaceConstraintPoint={(position) => {
          pointPicks.push(position);
        }}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={(entityId) => {
          selectedEntityIds.push(entityId);
        }}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 280, clientY: 220 });

    expect(screen.getByText("Pick a point to define the track axis")).toBeDefined();
    expect(entityPicks).toEqual(["ball-1"]);
    expect(pointPicks).toEqual([{ x: 280, y: 220 }]);
    expect(selectedEntityIds).toEqual([]);
  });

  it("renders display entities separately from authoring entities", () => {
    const state = createInitialEditorState();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 236,
            y: 288,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={state}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    expect(ball.style.left).toBe("236px");
    expect(ball.style.top).toBe("288px");
  });

  it("renders spring overlays from projected display entity centers", () => {
    render(
      <WorkspaceCanvas
        constraints={[
          {
            id: "spring-1",
            kind: "spring",
            entityAId: "ball-1",
            entityBId: "board-1",
            restLength: 236,
            stiffness: 32,
          },
        ]}
        display={createDisplaySettings()}
        displayEntities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 236,
            y: 288,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 400,
            y: 262,
            width: 120,
            height: 18,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 320,
            y: 260,
            width: 120,
            height: 18,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={createInitialEditorState()}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const spring = screen.getByTestId("scene-constraint-spring-spring-1") as HTMLElement;

    expect(spring.style.left).toBe("260px");
    expect(spring.style.top).toBe("312px");
  });

  it("keeps track overlays visible while attached entities are projected", () => {
    render(
      <WorkspaceCanvas
        constraints={[
          {
            id: "track-1",
            kind: "track",
            entityId: "ball-1",
            origin: { x: 144, y: 204 },
            axis: { x: 168, y: 44 },
          },
        ]}
        display={createDisplaySettings()}
        displayEntities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 236,
            y: 288,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={createInitialEditorState()}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("scene-constraint-track-track-1")).toBeDefined();
    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("236px");
  });

  it("keeps labels and lock markers while rendering projected runtime entities", () => {
    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={[
          {
            id: "board-1",
            kind: "board",
            label: "Ramp",
            x: 400,
            y: 262,
            width: 148,
            height: 24,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: true,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        entities={[
          {
            id: "board-1",
            kind: "board",
            label: "Ramp",
            x: 320,
            y: 260,
            width: 148,
            height: 24,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: true,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={createInitialEditorState()}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;

    expect(board.style.left).toBe("400px");
    expect(board.style.top).toBe("262px");
    expect(board.textContent).toContain("Ramp");
    expect(screen.getByTestId("scene-entity-lock-board-1")).toBeDefined();
  });

  it("blocks dragging bodies while authoring is locked", () => {
    const moves: Array<{ id: string; x: number; y: number }> = [];

    render(
      <WorkspaceCanvas
        authoringLocked
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={(id, position) => {
          moves.push({ id, ...position });
        }}
        state={createInitialEditorState()}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.mouseDown(screen.getByTestId("scene-entity-ball-1"), { clientX: 120, clientY: 180 });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 240 });
    fireEvent.mouseUp(window);

    expect(moves).toEqual([]);
  });

  it("blocks place-body stage clicks while authoring is locked", () => {
    const created: Array<{ x: number; y: number }> = [];

    render(
      <WorkspaceCanvas
        authoringLocked
        display={createDisplaySettings()}
        entities={[]}
        onCreateEntity={(position) => {
          created.push(position);
        }}
        onMoveEntity={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-body",
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-stage"), { clientX: 248, clientY: 204 });

    expect(created).toEqual([]);
  });

  it("keeps selection available and blocks constraint picks while authoring is locked", () => {
    const entityPicks: string[] = [];
    const selectedEntityIds: string[] = [];

    render(
      <WorkspaceCanvas
        authoringLocked
        constraintPlacement={{
          anchorEntityId: null,
          hint: "Select first body for the spring",
          kind: "spring",
          mode: "pick-entity",
        }}
        display={createDisplaySettings()}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 120,
            y: 180,
            radius: 24,
            mass: 1,
            friction: 0.12,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onPlaceConstraintEntity={(entityId) => {
          entityPicks.push(entityId);
        }}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={(entityId) => {
          selectedEntityIds.push(entityId);
        }}
        onToolChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));

    expect(entityPicks).toEqual([]);
    expect(selectedEntityIds).toEqual(["ball-1"]);
  });

  it("shows a playback lock hint while authoring is locked", () => {
    render(
      <WorkspaceCanvas
        authoringLocked
        display={createDisplaySettings()}
        entities={[]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        state={createInitialEditorState()}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    expect(
      screen.getByText("Playback running. Move, placement, and constraint editing are temporarily locked."),
    ).toBeDefined();
  });
});
