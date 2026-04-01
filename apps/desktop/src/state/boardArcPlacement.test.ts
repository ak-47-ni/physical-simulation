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

describe("boardArcPlacement", () => {
  it("detects board endpoints and travel tangents from board geometry", async () => {
    const { getBoardArcEndpoints } = await loadBoardArcPlacement();
    const endpoints = getBoardArcEndpoints(createBoard());

    expect(endpoints.start.key).toBe("start");
    expect(endpoints.start.point.x).toBeCloseTo(8.267949, 6);
    expect(endpoints.start.point.y).toBeCloseTo(3.5, 6);
    expect(endpoints.start.tangent.x).toBeCloseTo(-0.866025, 6);
    expect(endpoints.start.tangent.y).toBeCloseTo(-0.5, 6);

    expect(endpoints.end.key).toBe("end");
    expect(endpoints.end.point.x).toBeCloseTo(11.732051, 6);
    expect(endpoints.end.point.y).toBeCloseTo(5.5, 6);
    expect(endpoints.end.tangent.x).toBeCloseTo(0.866025, 6);
    expect(endpoints.end.tangent.y).toBeCloseTo(0.5, 6);
  });
});
