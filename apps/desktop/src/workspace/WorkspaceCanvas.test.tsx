import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createInitialEditorState,
  type EditorSceneEntity,
} from "../state/editorStore";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import {
  createDisplaySettings,
  meterViewport,
  WorkspaceCanvasLibraryDragHover,
  WorkspaceCanvasPanHarness,
} from "./WorkspaceCanvas.testSupport";

afterEach(() => {
  cleanup();
});

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

  it("hides legacy tool buttons and omits the workspace grid quick toggle", () => {
    render(
      <WorkspaceCanvas
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

    expect(screen.queryByRole("button", { name: /select tool/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /pan tool/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /place body tool/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide grid/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /show grid/i })).toBeNull();
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
            id: "block-1",
            kind: "block",
            label: "Block 1",
            x: 212,
            y: 236,
            width: 84,
            height: 52,
            mass: 2.8,
            friction: 0.36,
            restitution: 0.24,
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
          {
            id: "polygon-1",
            kind: "polygon",
            label: "Polygon 1",
            x: 460,
            y: 188,
            width: 76,
            height: 76,
            mass: 2.2,
            friction: 0.28,
            restitution: 0.22,
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
    const block = screen.getByTestId("scene-entity-block-1") as HTMLElement;
    const board = screen.getByTestId("scene-entity-board-1") as HTMLElement;
    const polygon = screen.getByTestId("scene-entity-polygon-1") as HTMLElement;

    expect(ball.style.width).toBe("60px");
    expect(ball.style.height).toBe("60px");
    expect(ball.style.borderRadius).toBe("999px");
    expect(block.style.width).toBe("84px");
    expect(block.style.height).toBe("52px");
    expect(block.style.borderRadius).toBe("0px");
    expect(board.style.width).toBe("148px");
    expect(board.style.height).toBe("24px");
    expect(board.style.borderRadius).toBe("0px");
    expect(polygon.style.width).toBe("76px");
    expect(polygon.style.height).toBe("76px");
    expect(polygon.style.borderRadius).toBe("0px");
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

  it("does not create a new entity from legacy place-body stage clicks", () => {
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

    expect(created).toEqual([]);
  });

  it("right-drag pans from an entity and suppresses the native context menu", () => {
    render(<WorkspaceCanvasPanHarness />);

    const stage = screen.getByTestId("workspace-stage");
    const entity = screen.getByTestId("scene-entity-ball-1");
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      cancelable: true,
    });

    fireEvent.mouseDown(entity, {
      button: 2,
      buttons: 2,
      clientX: 240,
      clientY: 200,
    });
    fireEvent.mouseMove(window, {
      buttons: 2,
      clientX: 300,
      clientY: 248,
    });
    fireEvent.mouseUp(window, {
      button: 2,
      clientX: 300,
      clientY: 248,
    });
    entity.dispatchEvent(contextMenuEvent);

    expect(screen.getByTestId("viewport-offset-readout").textContent).toBe("60,48");
    expect(contextMenuEvent.defaultPrevented).toBe(true);
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

  it("keeps left-drag entity movement in authored coordinates after panning the viewport", () => {
    const moves: Array<{ id: string; x: number; y: number }> = [];

    render(<WorkspaceCanvasPanHarness onMoveEntity={(id, position) => moves.push({ id, ...position })} />);

    fireEvent.mouseDown(screen.getByTestId("workspace-stage"), {
      button: 2,
      buttons: 2,
      clientX: 240,
      clientY: 200,
    });
    fireEvent.mouseMove(window, {
      buttons: 2,
      clientX: 300,
      clientY: 248,
    });
    fireEvent.mouseUp(window, { button: 2, clientX: 300, clientY: 248 });

    expect(screen.getByTestId("viewport-offset-readout").textContent).toBe("60,48");

    fireEvent.mouseDown(screen.getByTestId("scene-entity-ball-1"), { clientX: 180, clientY: 228 });
    fireEvent.mouseMove(window, { clientX: 210, clientY: 270 });
    fireEvent.mouseUp(window);

    expect(moves).toEqual([{ id: "ball-1", x: 1.5, y: 2.22 }]);
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
            origin: { x: 1.44, y: 2.04 },
            axis: { x: 1.68, y: 0.44 },
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
        viewport={meterViewport}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />,
    );

    const track = screen.getByTestId("scene-constraint-track-track-1") as HTMLElement;

    expect(track.style.left).toBe("144px");
    expect(track.style.top).toBe("204px");
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

  it("renders a stable body-drag preview and reports offset-aware hover payloads over the stage", () => {
    const hoverChanges: Array<WorkspaceCanvasLibraryDragHover | null> = [];

    render(
      <WorkspaceCanvasPanHarness
        libraryDragSession={{
          bodyKind: "ball",
          pointerClientPx: { x: 248, y: 204 },
        }}
        initialViewport={{
          ...meterViewport,
          offsetPx: { x: 40, y: 20 },
        }}
        onLibraryDragHoverChange={(hover) => {
          hoverChanges.push(hover);
        }}
      />,
    );

    const stage = screen.getByTestId("workspace-stage");

    fireEvent.mouseMove(stage, { clientX: 248, clientY: 204 });

    expect(screen.getByTestId("workspace-stage-body-preview")).toBeDefined();
    expect(hoverChanges.at(-1)).toEqual({
      authoringPosition: { x: 2.08, y: 1.84 },
      isOverStage: true,
    });

    fireEvent.mouseLeave(stage);

    expect(screen.queryByTestId("workspace-stage-body-preview")).toBeNull();
    expect(hoverChanges.at(-1)).toEqual({
      authoringPosition: null,
      isOverStage: false,
    });
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
