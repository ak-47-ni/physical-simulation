import { describe, expect, it } from "vitest";

import type { BallSceneEntity, EditorSceneEntity, SizedSceneEntity } from "./editorStore";
import { canPlaceAuthoringEntity, findAuthoringOverlap } from "./authoringOccupancy";

function createBall(
  overrides: Partial<BallSceneEntity> & Pick<BallSceneEntity, "id" | "label">,
): BallSceneEntity {
  return {
    id: overrides.id,
    kind: "ball",
    label: overrides.label,
    x: 0,
    y: 0,
    radius: 10,
    mass: 1,
    friction: 0.2,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

function createSizedEntity(
  kind: SizedSceneEntity["kind"],
  overrides: Partial<SizedSceneEntity> & Pick<SizedSceneEntity, "id" | "label">,
): SizedSceneEntity {
  return {
    id: overrides.id,
    kind,
    label: overrides.label,
    x: 0,
    y: 0,
    width: 120,
    height: 20,
    rotationDegrees: 0,
    mass: 1,
    friction: 0.2,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

function createRectFromCenter(input: {
  centerX: number;
  centerY: number;
  height: number;
  id: string;
  kind: SizedSceneEntity["kind"];
  label: string;
  rotationDegrees?: number;
  width: number;
}): SizedSceneEntity {
  return createSizedEntity(input.kind, {
    id: input.id,
    label: input.label,
    x: input.centerX - input.width / 2,
    y: input.centerY - input.height / 2,
    width: input.width,
    height: input.height,
    rotationDegrees: input.rotationDegrees ?? 0,
  });
}

function createBallFromCenter(input: {
  centerX: number;
  centerY: number;
  id: string;
  label: string;
  radius: number;
}): BallSceneEntity {
  return createBall({
    id: input.id,
    label: input.label,
    x: input.centerX - input.radius,
    y: input.centerY - input.radius,
    radius: input.radius,
  });
}

function readRectCenter(entity: SizedSceneEntity) {
  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function createRotatedBoardTouchingBall(distanceOffset = 0) {
  const board = createRectFromCenter({
    centerX: 180,
    centerY: 140,
    height: 18,
    id: "board-1",
    kind: "board",
    label: "Board 1",
    rotationDegrees: 30,
    width: 120,
  });
  const boardCenter = readRectCenter(board);
  const rotationRadians = degreesToRadians(board.rotationDegrees ?? 0);
  const outwardNormal = {
    x: -Math.sin(rotationRadians),
    y: Math.cos(rotationRadians),
  };
  const ballRadius = 12;
  const distanceFromCenter = board.height / 2 + ballRadius - distanceOffset;

  const ball = createBallFromCenter({
    centerX: boardCenter.x + outwardNormal.x * distanceFromCenter,
    centerY: boardCenter.y + outwardNormal.y * distanceFromCenter,
    id: "ball-1",
    label: "Ball 1",
    radius: ballRadius,
  });

  return {
    ball,
    board,
  };
}

describe("authoringOccupancy", () => {
  it("allows ball-ball contact without penetration", () => {
    const existing = createBall({
      id: "ball-1",
      label: "Ball 1",
      radius: 10,
      x: 0,
      y: 0,
    });
    const candidate = createBall({
      id: "ball-2",
      label: "Ball 2",
      radius: 10,
      x: 20,
      y: 0,
    });

    expect(
      canPlaceAuthoringEntity({
        candidate,
        entities: [existing],
      }),
    ).toBe(true);
  });

  it("blocks ball-ball penetration", () => {
    const existing = createBall({
      id: "ball-1",
      label: "Ball 1",
      radius: 10,
      x: 0,
      y: 0,
    });
    const candidate = createBall({
      id: "ball-2",
      label: "Ball 2",
      radius: 10,
      x: 19,
      y: 0,
    });

    expect(
      findAuthoringOverlap({
        candidate,
        entities: [existing],
      }),
    ).toEqual({
      entityId: "ball-1",
      label: "Ball 1",
    });
  });

  it("allows a ball to touch a rotated board edge exactly", () => {
    const { ball, board } = createRotatedBoardTouchingBall();

    expect(
      canPlaceAuthoringEntity({
        candidate: ball,
        entities: [board],
      }),
    ).toBe(true);
  });

  it("blocks a ball from penetrating a rotated board", () => {
    const { ball, board } = createRotatedBoardTouchingBall(1);

    expect(
      findAuthoringOverlap({
        candidate: ball,
        entities: [board],
      }),
    ).toEqual({
      entityId: "board-1",
      label: "Board 1",
    });
  });

  it("blocks penetration between rotated rectangles", () => {
    const board = createRectFromCenter({
      centerX: 220,
      centerY: 180,
      height: 18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 35,
      width: 150,
    });
    const block = createRectFromCenter({
      centerX: 222,
      centerY: 184,
      height: 52,
      id: "block-1",
      kind: "block",
      label: "Block 1",
      rotationDegrees: -18,
      width: 84,
    });

    expect(
      canPlaceAuthoringEntity({
        candidate: block,
        entities: [board],
      }),
    ).toBe(false);
  });

  it("allows separated rotated rectangles", () => {
    const board = createRectFromCenter({
      centerX: 220,
      centerY: 180,
      height: 18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 35,
      width: 150,
    });
    const block = createRectFromCenter({
      centerX: 360,
      centerY: 180,
      height: 52,
      id: "block-1",
      kind: "block",
      label: "Block 1",
      rotationDegrees: -18,
      width: 84,
    });

    expect(
      canPlaceAuthoringEntity({
        candidate: block,
        entities: [board],
      }),
    ).toBe(true);
  });

  it("ignores the moving entity itself when ignoreEntityId matches", () => {
    const board = createRectFromCenter({
      centerX: 220,
      centerY: 180,
      height: 18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 24,
      width: 150,
    });

    expect(
      canPlaceAuthoringEntity({
        candidate: board,
        entities: [board],
        ignoreEntityId: "board-1",
      }),
    ).toBe(true);
  });

  it("treats polygon occupancy as a rotated rectangle for this milestone", () => {
    const polygon = createRectFromCenter({
      centerX: 260,
      centerY: 220,
      height: 76,
      id: "polygon-1",
      kind: "polygon",
      label: "Polygon 1",
      rotationDegrees: 22,
      width: 76,
    });
    const block = createRectFromCenter({
      centerX: 270,
      centerY: 220,
      height: 52,
      id: "block-1",
      kind: "block",
      label: "Block 1",
      rotationDegrees: 0,
      width: 84,
    });

    expect(
      findAuthoringOverlap({
        candidate: block,
        entities: [polygon] satisfies EditorSceneEntity[],
      }),
    ).toEqual({
      entityId: "polygon-1",
      label: "Polygon 1",
    });
  });
});
