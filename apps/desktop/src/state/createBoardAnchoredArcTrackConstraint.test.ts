import { describe, expect, it } from "vitest";

import type { EditorSceneEntity } from "./editorStore";

async function loadCreateBoardAnchoredArcTrackConstraint() {
  try {
    return await import("./createBoardAnchoredArcTrackConstraint");
  } catch (error) {
    throw new Error(`createBoardAnchoredArcTrackConstraint module missing: ${String(error)}`);
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
    rotationDegrees: 0,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

describe("createBoardAnchoredArcTrackConstraint", () => {
  it("creates a 180-degree inside arc that enters from the selected start endpoint", async () => {
    const { createBoardAnchoredArcTrackConstraint } =
      await loadCreateBoardAnchoredArcTrackConstraint();

    const constraint = createBoardAnchoredArcTrackConstraint({
      board: createBoard(),
      center: { x: 8, y: 5.5 },
      endpointKey: "start",
      id: "arc-track-1",
    });

    expect(constraint).toEqual({
      center: { x: 8, y: 5.5 },
      endAngleDegrees: 270,
      entryEndpoint: "start",
      id: "arc-track-1",
      kind: "arc-track",
      radius: 1,
      side: "inside",
      startAngleDegrees: 90,
    });
  });

  it("chooses the end arc endpoint when the selected board end approaches the opposite tangent", async () => {
    const { createBoardAnchoredArcTrackConstraint } =
      await loadCreateBoardAnchoredArcTrackConstraint();

    const constraint = createBoardAnchoredArcTrackConstraint({
      board: createBoard(),
      center: { x: 12, y: 5.5 },
      endpointKey: "end",
      id: "arc-track-2",
    });

    expect(constraint).toEqual({
      center: { x: 12, y: 5.5 },
      endAngleDegrees: 90,
      entryEndpoint: "end",
      id: "arc-track-2",
      kind: "arc-track",
      radius: 1,
      side: "inside",
      startAngleDegrees: -90,
    });
  });
});
