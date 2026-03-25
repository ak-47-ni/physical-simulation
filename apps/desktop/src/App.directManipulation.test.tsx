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
        data-testid="mock-workspace-canvas"
        data-tool={String((props.state as { activeTool: string }).activeTool)}
      >
        <button
          type="button"
          onClick={() =>
            (props.onLibraryDragHoverChange as
              | undefined
              | ((hover: unknown) => void))?.({
              authoringPosition: { x: 2.48, y: 2.04 },
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
        <button type="button" onClick={() => (props.onCancelPlacement as () => void)?.()}>
          Cancel placement
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
});
