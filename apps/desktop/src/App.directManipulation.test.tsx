import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
          onClick={() => {
            const session: LibraryDragSession = {
              bodyKind: "arc-track",
              pointerClientPx: { x: 24, y: 36 },
            };

            (props.onStartBodyDrag as undefined | ((session: unknown) => void))?.(session);
          }}
        >
          Start arc-track drag
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
        data-constraint-stage={String(
          (props.constraintPlacement as { stage?: string } | null)?.stage ?? "none",
        )}
        data-draft-radius={String(
          (props.constraintPlacement as { draftRadius?: number | null } | null)?.draftRadius ??
            "none",
        )}
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
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  cleanup();
  mockLibraryState.latestProps = null;
  mockWorkspaceState.latestProps = null;
});

function readLatestWorkspaceProps() {
  return mockWorkspaceState.latestProps as {
    authoringPlacementPreview?: { entity?: { kind?: string }; status?: string } | null;
    displayEntities?: Array<Record<string, unknown>>;
    entities?: Array<Record<string, unknown>>;
  } | null;
}

function readLatestArcTrackEntity() {
  const entity = readLatestWorkspaceProps()?.entities?.find(
    (candidate) => candidate.id === "arc-track-1",
  );

  if (!entity) {
    throw new Error("expected latest workspace arc-track entity");
  }

  return entity;
}

function readLatestDisplayEntity(entityId: string) {
  const entity = readLatestWorkspaceProps()?.displayEntities?.find(
    (candidate) => candidate.id === entityId,
  );

  if (!entity) {
    throw new Error(`expected latest workspace display entity ${entityId}`);
  }

  return entity;
}

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

  it("publishes a blocked arc-track preview when the drag is away from a board or block endpoint", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));

    const placementPreview = readLatestWorkspaceProps()?.authoringPlacementPreview;

    expect(placementPreview).not.toBeNull();
    expect(placementPreview?.entity?.kind).toBe("arc-track");
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-placement-preview-status")).toBe(
      "blocked",
    );

    fireEvent.pointerUp(window);

    expect(screen.queryByTestId("scene-tree-item-arc-track-1")).toBeNull();
  });

  it("creates a board-anchored arc-track guide when a body drag release lands on a valid endpoint", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover occupied stage" }));

    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-placement-preview-status")).toBe(
      "snap",
    );

    fireEvent.pointerUp(window);

    expect(screen.getByTestId("scene-tree-item-arc-track-1").getAttribute("data-selected")).toBe(
      "true",
    );

    const entity = readLatestArcTrackEntity();

    expect(entity).toMatchObject({
      anchorEntityId: "board-1",
      anchorEntityKind: "board",
      anchorEndpoint: "start",
      center: { x: 3.18, y: 3.72 },
      entryEndpoint: "start",
      radius: 1,
      rotationDegrees: 135,
      sweepAngleDegrees: 90,
    });
    expect(
      readLatestWorkspaceProps()?.displayEntities?.some((displayEntity) => displayEntity.id === "arc-track-1"),
    ).toBe(true);
  });

  it("creates a block-anchored arc-track guide after a block is placed on the stage", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start block drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    expect(screen.getByTestId("scene-tree-item-arc-track-1")).toBeDefined();
    expect(readLatestArcTrackEntity()).toMatchObject({
      anchorEntityId: "block-1",
      anchorEntityKind: "block",
      anchorEndpoint: "start",
      entryEndpoint: "start",
    });
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

  it("keeps arc-track library selection on the normal body-placement flow", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Select arc track" }));

    expect(screen.queryByText("Select a locked board for the arc track")).toBeNull();
    expect(screen.getByTestId("mock-workspace-canvas").getAttribute("data-tool")).toBe("select");

    fireEvent.click(screen.getByRole("button", { name: "Pick ball for constraint" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick board for constraint" }));

    expect(screen.queryByTestId("scene-tree-constraint-arc-track-1")).toBeNull();
    expect(screen.queryByText("Select a locked board for the arc track")).toBeNull();
  });

  it("recomputes anchored arc-track geometry from radius, sweep, and rotation edits while preserving attachment", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover occupied stage" }));
    fireEvent.pointerUp(window);

    expect(screen.queryByLabelText("Center X")).toBeNull();
    expect(screen.getByLabelText("Radius")).toBeDefined();
    expect(screen.getByLabelText("Sweep angle")).toBeDefined();
    expect(screen.getByLabelText("Rotation")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "-140" } });

    expect(readLatestArcTrackEntity()).toMatchObject({
      anchorEntityId: "board-1",
      anchorEndpoint: "start",
      center: { x: 3.18, y: 1.72 },
      entryEndpoint: "end",
      rotationDegrees: -135,
    });

    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "1.23" } });

    expect(readLatestArcTrackEntity()).toMatchObject({
      anchorEntityId: "board-1",
      center: { x: 3.18, y: 1.52 },
      entryEndpoint: "end",
      radius: 1.2,
      rotationDegrees: -135,
    });

    fireEvent.change(screen.getByLabelText("Sweep angle"), { target: { value: "120" } });

    expect(readLatestArcTrackEntity()).toMatchObject({
      anchorEntityId: "board-1",
      anchorEntityKind: "board",
      anchorEndpoint: "start",
      center: { x: 3.18, y: 1.52 },
      entryEndpoint: "end",
      radius: 1.2,
      rotationDegrees: -150,
      sweepAngleDegrees: 120,
    });
  });

  it("removes anchored arc-track guides when their anchor body is deleted", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover occupied stage" }));
    fireEvent.pointerUp(window);

    expect(screen.getByTestId("scene-tree-item-arc-track-1")).toBeDefined();

    fireEvent.click(screen.getByTestId("scene-tree-item-board-1"));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(screen.queryByTestId("scene-tree-item-board-1")).toBeNull();
    expect(screen.queryByTestId("scene-tree-item-arc-track-1")).toBeNull();
  });

  it("keeps block-junction handoff visible after direct-manipulation setup and runtime start", async () => {
    const compileRequests: Array<{
      scene: {
        entities: Array<Record<string, unknown>>;
      };
    }> = [];
    const commands: string[] = [];
    let tickCount = 0;
    (globalThis as {
      __TAURI_INTERNALS__?: {
        invoke: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
      };
    }).__TAURI_INTERNALS__ = {
      invoke: async (command, payload) => {
        commands.push(command);

        if (command === "compile_scene") {
          const request = (payload as {
            request: {
              scene: {
                entities: Array<Record<string, unknown>>;
              };
            };
          }).request;
          compileRequests.push(request);

          return {
            status: "paused",
            currentFrame: null,
            currentTimeSeconds: 0,
            timeScale: 1,
            dirtyScopes: [],
            rebuildRequired: true,
            canResume: true,
            blockReason: "rebuild-required",
            playbackMode: "precomputed",
            totalDurationSeconds: 20,
            preparingProgress: null,
            canSeek: false,
            resultState: "stale",
          };
        }

        if (command === "start_runtime") {
          return {
            status: "running",
            currentFrame: null,
            currentTimeSeconds: 0,
            timeScale: 1,
            dirtyScopes: [],
            rebuildRequired: false,
            canResume: true,
            blockReason: null,
            playbackMode: "precomputed",
            totalDurationSeconds: 20,
            preparingProgress: null,
            canSeek: false,
            resultState: "calculating",
          };
        }

        if (command === "pause_runtime") {
          return {
            status: "paused",
            currentFrame: null,
            currentTimeSeconds: tickCount / 60,
            timeScale: 1,
            dirtyScopes: [],
            rebuildRequired: false,
            canResume: true,
            blockReason: null,
            playbackMode: "precomputed",
            totalDurationSeconds: 20,
            preparingProgress: null,
            canSeek: true,
            resultState: "ready",
          };
        }

        if (command === "reset_runtime") {
          return {
            status: "paused",
            currentFrame: null,
            currentTimeSeconds: 0,
            timeScale: 1,
            dirtyScopes: [],
            rebuildRequired: true,
            canResume: true,
            blockReason: "rebuild-required",
            playbackMode: "precomputed",
            totalDurationSeconds: 20,
            preparingProgress: null,
            canSeek: false,
            resultState: "stale",
          };
        }

        if (command === "tick_runtime") {
          tickCount += 1;

          return {
            status: "paused",
            currentFrame: {
              frameNumber: tickCount,
              entities: [
                {
                  entityId: "ball-1",
                  position: { x: 3.18, y: 2.33 },
                  rotation: 0,
                  velocity: { x: 0.85, y: 0.8 },
                },
                {
                  entityId: "block-1",
                  position: { x: 2.9, y: 2.3 },
                  rotation: 0,
                },
                {
                  entityId: "arc-track-1",
                  position: { x: 2.48, y: 3.04 },
                  rotation: (135 * Math.PI) / 180,
                },
              ],
            },
            currentTimeSeconds: tickCount / 60,
            timeScale: 1,
            dirtyScopes: [],
            rebuildRequired: false,
            canResume: true,
            blockReason: null,
            playbackMode: "precomputed",
            totalDurationSeconds: 20,
            preparingProgress: null,
            canSeek: true,
            resultState: "ready",
          };
        }

        throw new Error(`unexpected command: ${command}`);
      },
    };

    render(<App />);
    const transport = within(screen.getByTestId("bottom-transport-bar"));

    fireEvent.click(screen.getByRole("button", { name: "Start block drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole("button", { name: "Start arc-track drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover stage" }));
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByTestId("scene-tree-item-ball-1"));
    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "1.96" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "1.56" } });
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "1.1" } });
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(transport.getByRole("button", { name: /^calculate$/i }));

    await waitFor(() => expect(commands.includes("start_runtime")).toBe(true));
    await waitFor(() => expect(commands.includes("tick_runtime")).toBe(true));
    await waitFor(() => expect(commands.includes("pause_runtime")).toBe(true));
    await waitFor(() => {
      expect(
        (screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled,
      ).toBe(false);
    });

    fireEvent.click(transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.click(transport.getByRole("button", { name: /^step$/i }));
    await waitFor(() => {
      const runtimeDisplayBall = readLatestDisplayEntity("ball-1");

      expect(Number(runtimeDisplayBall.x)).toBe(294);
      expect(Number(runtimeDisplayBall.y)).toBe(209);
    });

    const latestRequestWithBlockArc = [...compileRequests]
      .reverse()
      .find((request) =>
        request.scene.entities.some((entity) => entity.id === "arc-track-1" || entity.id === "ball-1"),
      );
    const compileBall = latestRequestWithBlockArc?.scene.entities.find((entity) => entity.id === "ball-1");
    const compileArc = latestRequestWithBlockArc?.scene.entities.find((entity) => entity.id === "arc-track-1");
    const displayBall = readLatestDisplayEntity("ball-1");
    const displayBallCenter = {
      x: Number(displayBall.x) + Number(displayBall.radius),
      y: Number(displayBall.y) + Number(displayBall.radius),
    };
    const guidedRadiusPx = Math.hypot(displayBallCenter.x - 248, displayBallCenter.y - 304);

    expect(compileBall).toMatchObject({
      id: "ball-1",
      kind: "ball",
      x: 1.96,
      y: 1.56,
      velocityX: 1.1,
      velocityY: 0,
    });
    expect(compileArc).toMatchObject({
      id: "arc-track-1",
      kind: "arc-track",
      anchorEntityId: "block-1",
      anchorEntityKind: "block",
      anchorEndpoint: "start",
      entryEndpoint: "start",
      radius: 1,
      rotationDegrees: 135,
      sweepAngleDegrees: 90,
    });
    expect(guidedRadiusPx).toBeCloseTo(100, 0);
    expect(displayBallCenter.y).toBeLessThan(250);
  });
});
