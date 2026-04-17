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

    expect(constraint).toMatchObject({
      center: { x: 8, y: 5.5 },
      entryEndpoint: "start",
      id: "arc-track-1",
      kind: "arc-track",
      side: "inside",
    });
    expect(constraint.radius).toBeCloseTo(1.5, 6);
    expect(constraint.startAngleDegrees).toBeCloseTo(90, 6);
    expect(constraint.endAngleDegrees).toBeCloseTo(270, 6);
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

    expect(constraint).toMatchObject({
      center: { x: 12, y: 5.5 },
      entryEndpoint: "end",
      id: "arc-track-2",
      kind: "arc-track",
      side: "inside",
    });
    expect(constraint.radius).toBeCloseTo(1.5, 6);
    expect(constraint.startAngleDegrees).toBeCloseTo(-90, 6);
    expect(constraint.endAngleDegrees).toBeCloseTo(90, 6);
  });

  it("applies the requested arc-span preset while preserving the tangent entry endpoint", async () => {
    const { createBoardAnchoredArcTrackConstraint } =
      await loadCreateBoardAnchoredArcTrackConstraint();

    const constraint = createBoardAnchoredArcTrackConstraint({
      board: createBoard(),
      center: { x: 8, y: 5.5 },
      endpointKey: "start",
      id: "arc-track-3",
      spanDegrees: 90,
    });

    expect(constraint).toMatchObject({
      center: { x: 8, y: 5.5 },
      entryEndpoint: "start",
      id: "arc-track-3",
      kind: "arc-track",
      side: "inside",
    });
    expect(constraint.radius).toBeCloseTo(1.5, 6);
    expect(constraint.startAngleDegrees).toBeCloseTo(90, 6);
    expect(constraint.endAngleDegrees).toBeCloseTo(180, 6);
  });

  it("keeps tilted-board start-endpoint arcs tangent-aligned in the same entry direction", async () => {
    const {
      createBoardAnchoredArcTrackConstraint,
      getBoardAnchoredArcTrackEntryPoint,
      getBoardAnchoredArcTrackEntryTangent,
    } =
      await loadCreateBoardAnchoredArcTrackConstraint();

    const constraint = createBoardAnchoredArcTrackConstraint({
      board: createBoard({
        rotationDegrees: 30,
      }),
      center: { x: 8.017949, y: 3.933012 },
      endpointKey: "start",
      id: "arc-track-4",
      spanDegrees: 90,
    });

    expect(constraint).toMatchObject({
      center: { x: 8.017949, y: 3.933012 },
      entryEndpoint: "start",
      id: "arc-track-4",
      kind: "arc-track",
      side: "inside",
    });
    expect(constraint.radius).toBeCloseTo(1, 4);
    expect(constraint.startAngleDegrees).toBeCloseTo(60, 4);
    expect(constraint.endAngleDegrees).toBeCloseTo(150, 4);
    expect(getBoardAnchoredArcTrackEntryPoint(constraint).x).toBeCloseTo(8.517949, 5);
    expect(getBoardAnchoredArcTrackEntryPoint(constraint).y).toBeCloseTo(3.066987, 5);
    expect(getBoardAnchoredArcTrackEntryTangent(constraint).x).toBeCloseTo(-0.866025, 6);
    expect(getBoardAnchoredArcTrackEntryTangent(constraint).y).toBeCloseTo(-0.5, 6);
  });
});
