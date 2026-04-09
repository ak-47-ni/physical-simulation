import { describe, expect, it } from "vitest";

import type { EditorSceneEntity } from "./editorStore";

async function loadBoardArcPlacement() {
  try {
    return await import("./boardArcPlacement");
  } catch (error) {
    throw new Error(`boardArcPlacement module missing: ${String(error)}`);
  }
}

function createBoard(
  overrides: Partial<Extract<EditorSceneEntity, { kind: "board" }>> = {},
): Extract<EditorSceneEntity, { kind: "board" }> {
  return {
    id: "board-1",
    kind: "board",
    label: "Board 1",
    x: 8,
    y: 4,
    width: 4,
    height: 1,
    mass: 5,
    friction: 0.42,
    restitution: 1,
    locked: true,
    rotationDegrees: 30,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

function createBlock(
  overrides: Partial<Extract<EditorSceneEntity, { kind: "block" }>> = {},
): Extract<EditorSceneEntity, { kind: "block" }> {
  return {
    id: "block-1",
    kind: "block",
    label: "Block 1",
    x: 4,
    y: 2,
    width: 2,
    height: 1,
    mass: 2.8,
    friction: 0.2,
    restitution: 1,
    locked: true,
    rotationDegrees: 90,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

describe("boardArcPlacement", () => {
  it("detects top-edge board endpoints and travel tangents from rotated board geometry", async () => {
    const { getBoardArcEndpoints } = (await loadBoardArcPlacement()) as typeof import("./boardArcPlacement");
    const endpoints = getBoardArcEndpoints(createBoard());

    expect(endpoints.start.key).toBe("start");
    expect(endpoints.start.point.x).toBeCloseTo(8.517949, 6);
    expect(endpoints.start.point.y).toBeCloseTo(3.066987, 6);
    expect(endpoints.start.tangent.x).toBeCloseTo(-0.866025, 6);
    expect(endpoints.start.tangent.y).toBeCloseTo(-0.5, 6);

    expect(endpoints.end.key).toBe("end");
    expect(endpoints.end.point.x).toBeCloseTo(11.982051, 6);
    expect(endpoints.end.point.y).toBeCloseTo(5.066987, 6);
    expect(endpoints.end.tangent.x).toBeCloseTo(0.866025, 6);
    expect(endpoints.end.tangent.y).toBeCloseTo(0.5, 6);
  });

  it("detects top-edge block endpoints and travel tangents from rotated block geometry", async () => {
    const { getBoardArcEndpoints } = (await loadBoardArcPlacement()) as typeof import("./boardArcPlacement");
    const endpoints = getBoardArcEndpoints(createBlock() as never);

    expect(endpoints.start.point.x).toBeCloseTo(5.5, 6);
    expect(endpoints.start.point.y).toBeCloseTo(1.5, 6);
    expect(endpoints.start.tangent.x).toBeCloseTo(0, 6);
    expect(endpoints.start.tangent.y).toBeCloseTo(-1, 6);
    expect(endpoints.end.point.x).toBeCloseTo(5.5, 6);
    expect(endpoints.end.point.y).toBeCloseTo(3.5, 6);
    expect(endpoints.end.tangent.x).toBeCloseTo(0, 6);
    expect(endpoints.end.tangent.y).toBeCloseTo(1, 6);
  });

  it("resolves the nearest top-edge endpoint when the drag hovers over the board body", async () => {
    const { resolveBoardArcSnapTarget } = (await loadBoardArcPlacement()) as typeof import("./boardArcPlacement");
    const board = createBoard({
      height: 0.24,
      rotationDegrees: 0,
      width: 1.48,
      x: 3.2,
      y: 2.6,
    });

    const snapTarget = resolveBoardArcSnapTarget({
      boards: [board],
      maxSnapDistance: 0.28,
      position: {
        x: 3.8,
        y: 2.72,
      },
    });

    expect(snapTarget).not.toBeNull();
    expect(snapTarget?.boardId).toBe("board-1");
    expect(snapTarget?.endpoint.key).toBe("start");
    expect(snapTarget?.endpoint.point.x).toBeCloseTo(3.2, 6);
    expect(snapTarget?.endpoint.point.y).toBeCloseTo(2.6, 6);
    expect(snapTarget?.boardDistance).toBeCloseTo(0, 6);
  });

  it("keeps nearest-target tie-breaking deterministic across board and block candidates", async () => {
    const { resolveBoardArcSnapTarget } = (await loadBoardArcPlacement()) as typeof import("./boardArcPlacement");
    const board = createBoard({
      id: "board-z",
      x: 3.2,
      y: 2.6,
      width: 1.48,
      height: 0.24,
      rotationDegrees: 0,
    });
    const block = createBlock({
      id: "block-a",
      x: 3.2,
      y: 2.6,
      width: 1.48,
      height: 0.24,
      rotationDegrees: 0,
    });
    const position = {
      x: 3.94,
      y: 2.72,
    };

    const forward = resolveBoardArcSnapTarget({
      boards: [board, block as never],
      maxSnapDistance: 0.28,
      position,
    });
    const reverse = resolveBoardArcSnapTarget({
      boards: [block as never, board],
      maxSnapDistance: 0.28,
      position,
    });

    expect(forward?.boardId).toBe("block-a");
    expect(forward?.endpoint.key).toBe("start");
    expect(reverse).toEqual(forward);
  });
});
