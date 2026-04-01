import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryDragSession } from "./workspace/libraryDragSession";

const mockLibraryState = vi.hoisted(() => ({
  latestProps: null as null | Record<string, unknown>,
}));

const mockWorkspaceState = vi.hoisted(() => ({
  latestProps: null as null | Record<string, unknown>,
}));

vi.mock("./panels/ObjectLibraryPanel", () => ({
  ObjectLibraryPanel: (props: Record<string, unknown>) => {
    mockLibraryState.latestProps = props;

    return (
      <div data-testid="mock-library-panel">
        <button
          type="button"
          onClick={() => {
            const session: LibraryDragSession = {
              bodyKind: "ball",
              pointerClientPx: { x: 24, y: 36 },
            };

            (props.onStartBodyDrag as undefined | ((session: unknown) => void))?.(session);
          }}
        >
          Start ball drag
        </button>
        <button
          type="button"
          onClick={() => {
            const session: LibraryDragSession = {
              bodyKind: "block",
              pointerClientPx: { x: 24, y: 36 },
            };

            (props.onStartBodyDrag as undefined | ((session: unknown) => void))?.(session);
          }}
        >
          Start block drag
        </button>
        <button
          type="button"
          onClick={() => (props.onSelectItem as (itemId: string) => void)("spring")}
        >
          Select spring
        </button>
        <button
          type="button"
          onClick={() => (props.onSelectItem as (itemId: string) => void)("track")}
        >
          Select track
        </button>
        <button
          type="button"
          onClick={() => (props.onSelectItem as (itemId: string) => void)("arc-track")}
        >
          Select arc track
        </button>
      </div>
    );
  },
}));

vi.mock("./workspace/WorkspaceCanvas", () => ({
  WorkspaceCanvas: (props: Record<string, unknown>) => {
    mockWorkspaceState.latestProps = props;

    return (
      <div
        data-library-drag-blocked={String(Boolean(props.libraryDragBlocked))}
        data-library-drag-active={String(Boolean(props.libraryDragSession))}
        data-placement-preview-status={String(
          (props.authoringPlacementPreview as { status?: string } | null)?.status ?? "none",
        )}
        data-testid="mock-workspace-canvas"
        data-tool={String((props.state as { activeTool: string }).activeTool)}
      >
        <button
          type="button"
          onClick={() =>
            (props.onLibraryDragHoverChange as
              | undefined
              | ((hover: unknown) => void))?.({
              authoringPosition: { x: 2.4841115113329357, y: 2.0441115113329357 },
              isOverStage: true,
            })
          }
        >
          Hover stage
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onLibraryDragHoverChange as
              | undefined
              | ((hover: unknown) => void))?.({
              authoringPosition: { x: 3.18, y: 2.72 },
              isOverStage: true,
            })
          }
        >
          Hover occupied stage
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onLibraryDragHoverChange as
              | undefined
              | ((hover: unknown) => void))?.({
              authoringPosition: { x: 3.36, y: 2.24 },
              isOverStage: true,
            })
          }
        >
          Hover block snap stage
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onLibraryDragHoverChange as
              | undefined
              | ((hover: unknown) => void))?.({
              authoringPosition: null,
              isOverStage: false,
            })
          }
        >
          Leave stage
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveEntity as
              | undefined
              | ((entityId: string, position: { x: number; y: number }) => void))?.("ball-1", {
              x: 3.18,
              y: 2.72,
            })
          }
        >
          Move ball to occupied area
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveEntity as
              | undefined
              | ((entityId: string, position: { x: number; y: number }) => void))?.("ball-1", {
              x: -0.004,
              y: -0.004,
            })
          }
        >
          Move ball outside first quadrant
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveEntity as
              | undefined
              | ((entityId: string, position: { x: number; y: number }) => void))?.("block-1", {
              x: 3.36,
              y: 2.24,
            })
          }
        >
          Move block near board face
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onMoveEntity as
              | undefined
              | ((entityId: string, position: { x: number; y: number }) => void))?.("block-1", {
              x: 3.18,
              y: 2.72,
            })
          }
        >
          Move block to deep overlap
        </button>
        <button type="button" onClick={() => (props.onCancelPlacement as () => void)?.()}>
          Cancel placement
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onPlaceConstraintEntity as undefined | ((entityId: string) => void))?.("board-1")
          }
        >
          Pick board for constraint
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onPlaceConstraintEntity as undefined | ((entityId: string) => void))?.("ball-1")
          }
        >
          Pick ball for constraint
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onPlaceConstraintBoardEndpoint as
              | undefined
              | ((endpointKey: "start" | "end") => void))?.("start")
          }
        >
          Pick board endpoint start
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onPlaceConstraintBoardEndpoint as
              | undefined
              | ((endpointKey: "start" | "end") => void))?.("end")
          }
        >
          Pick board endpoint end
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onPlaceConstraintPoint as
              | undefined
              | ((position: { x: number; y: number }) => void))?.({
              x: 1.56,
              y: 3,
            })
          }
        >
          Pick constraint point
        </button>
        {(props.constraintPlacement as { hint: string } | null)?.hint ? (
          <span>{(props.constraintPlacement as { hint: string }).hint}</span>
        ) : null}
      </div>
    );
  },
}));

import { App } from "./App";

afterEach(() => {
  cleanup();
  mockLibraryState.latestProps = null;
  mockWorkspaceState.latestProps = null;
});

describe("App direct manipulation contracts", () => {
  it("creates exactly one body when a dragged library body is released over the stage", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start ball drag" }));

    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe("select");
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-library-drag-active")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    expect(screen.getByTestId("scene-tree-item-ball-2").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("2.48 m, 2.04 m")).toBeDefined();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-library-drag-active")).toBe(
      "false",
    );

    fireEvent.pointerUp(window);

    expect(screen.queryByTestId("scene-tree-item-ball-3")).toBeNull();
  });

  it("cancels an active body drag on escape before release", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start ball drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window);

    expect(screen.queryByTestId("scene-tree-item-ball-2")).toBeNull();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-library-drag-active")).toBe(
      "false",
    );
  });

  it("keeps the last legal body position when a drag move targets an occupied area", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-tree-item-ball-1"));

    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("1.32");
    expect((screen.getByLabelText("Position Y") as HTMLInputElement).value).toBe("1.76");

    fireEvent.click(screen.getByRole("button", { name: "Move ball to occupied area" }));

    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("1.32");
    expect((screen.getByLabelText("Position Y") as HTMLInputElement).value).toBe("1.76");
  });

  it("does not create a new body when a dragged library body is released over an occupied area", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start ball drag" }));

    fireEvent.click(screen.getByRole("button", { name: "Hover occupied stage" }));
    fireEvent.pointerUp(window);

    expect(screen.queryByTestId("scene-tree-item-ball-2")).toBeNull();
  });

  it("publishes a snap preview and commits a snapped block on library drop release", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start block drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover block snap stage" }));

    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-placement-preview-status")).toBe(
      "snap",
    );

    fireEvent.pointerUp(window);

    expect(screen.getByTestId("scene-tree-item-block-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("3.36 m, 2.2 m")).toBeDefined();
  });

  it("commits a snapped block pose when a drag release lands near a board face", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start block drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    expect(screen.getByText("2.48 m, 2.04 m")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Move block near board face" }));

    expect(screen.getByText("2.48 m, 2.04 m")).toBeDefined();

    fireEvent.mouseUp(window);

    expect(screen.getByText("3.36 m, 2.2 m")).toBeDefined();
  });

  it("clamps a drag move and release into the first quadrant", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-tree-item-ball-1"));
    fireEvent.click(screen.getByRole("button", { name: "Move ball outside first quadrant" }));
    fireEvent.mouseUp(window);

    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("Position Y") as HTMLInputElement).value).toBe("0");
    expect(screen.getByText("0 m, 0 m")).toBeDefined();
  });

  it("keeps the last legal block pose when release target cannot resolve to contact", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start block drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole("button", { name: "Move block to deep overlap" }));
    fireEvent.mouseUp(window);

    expect(screen.getByText("2.48 m, 2.04 m")).toBeDefined();
  });

  it("keeps guided constraint placement cancelable while body drags use the select tool", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Select spring" }));

    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe(
      "place-constraint",
    );
    expect(screen.getByText("Select first body for the spring")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe("select");
    expect(screen.queryByText("Select first body for the spring")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select track" }));

    expect(screen.getByText("Select a body for the track")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cancel placement" }));

    expect(screen.queryByText("Select a body for the track")).toBeNull();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe("select");
  });

  it("keeps arc-track placement on the locked-board flow and ignores balls or unlocked boards", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Select arc track" }));

    expect(screen.getByText("Select a locked board for the arc track")).toBeDefined();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe(
      "place-constraint",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pick ball for constraint" }));

    expect(screen.queryByTestId("scene-tree-constraint-arc-track-1")).toBeNull();
    expect(screen.getByText("Select a locked board for the arc track")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Pick board for constraint" }));

    expect(screen.queryByTestId("scene-tree-constraint-arc-track-1")).toBeNull();
    expect(screen.getByText("Select a locked board for the arc track")).toBeDefined();
  });

  it("creates a board-anchored arc after a locked board, endpoint, and center pick", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-tree-item-board-1"));
    fireEvent.click(screen.getByLabelText("Locked in simulation"));
    fireEvent.click(screen.getByRole("button", { name: "Select arc track" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick board for constraint" }));

    expect(screen.getByText("Select the board endpoint for the arc junction")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Pick board endpoint start" }));

    expect(screen.getByText("Pick a center point for the arc track")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Pick constraint point" }));

    expect(screen.queryByText("Select the board endpoint for the arc junction")).toBeNull();
    expect(screen.queryByText("Pick a center point for the arc track")).toBeNull();
    expect(screen.getByTestId("scene-tree-constraint-arc-track-1")).toBeDefined();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe("select");
  });

  it("keeps a created arc-track after deleting the source board", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-tree-item-board-1"));
    fireEvent.click(screen.getByLabelText("Locked in simulation"));
    fireEvent.click(screen.getByRole("button", { name: "Select arc track" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick board for constraint" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick board endpoint start" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick constraint point" }));

    expect(screen.getByTestId("scene-tree-constraint-arc-track-1")).toBeDefined();

    fireEvent.click(screen.getByTestId("scene-tree-item-board-1"));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(screen.queryByTestId("scene-tree-item-board-1")).toBeNull();
    expect(screen.getByTestId("scene-tree-constraint-arc-track-1")).toBeDefined();
  });
});
