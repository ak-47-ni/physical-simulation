import { describe, expect, it } from "vitest";

import { canPlaceAuthoringEntity, findAuthoringOverlap } from "./authoringOccupancy";
import {
  getDefaultAuthoringSnapDistance,
  resolveAuthoringPlacement,
} from "./authoringContactSnap";
import type { BallSceneEntity, SizedSceneEntity } from "./editorStore";

function createBall(
  overrides: Partial<BallSceneEntity> & Pick<BallSceneEntity, "id" | "label">,
): BallSceneEntity {
  return {
    x: 0,
    y: 0,
    radius: 0.12,
    mass: 1,
    friction: 0.2,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
    id: overrides.id,
    kind: "ball",
    label: overrides.label,
  };
}

function createSizedEntity(
  kind: SizedSceneEntity["kind"],
  overrides: Partial<SizedSceneEntity> & Pick<SizedSceneEntity, "id" | "label">,
): SizedSceneEntity {
  return {
    x: 0,
    y: 0,
    width: 1.2,
    height: 0.18,
    rotationDegrees: 0,
    mass: 1,
    friction: 0.2,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
    id: overrides.id,
    kind,
    label: overrides.label,
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

function readCenter(entity: BallSceneEntity | SizedSceneEntity) {
  if (entity.kind === "ball") {
    return {
      x: entity.x + entity.radius,
      y: entity.y + entity.radius,
    };
  }

  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function readRectNormal(entity: SizedSceneEntity) {
  const rotationRadians = degreesToRadians(entity.rotationDegrees ?? 0);

  return {
    x: -Math.sin(rotationRadians),
    y: Math.cos(rotationRadians),
  };
}

describe("authoringContactSnap", () => {
  it("returns free for legal candidates far from every body", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 30,
      width: 1.2,
    });
    const candidate = createRectFromCenter({
      centerX: 4.8,
      centerY: 1.6,
      height: 0.52,
      id: "block-1",
      kind: "block",
      label: "Block 1",
      rotationDegrees: 30,
      width: 0.84,
    });

    expect(
      resolveAuthoringPlacement({
        candidate,
        entities: [board],
        maxSnapDistance: getDefaultAuthoringSnapDistance("m"),
      }),
    ).toMatchObject({
      entity: candidate,
      status: "free",
    });
  });

  it("does not snap a legal candidate when the nearest contact is beyond the threshold", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 30,
      width: 1.2,
    });
    const boardCenter = readCenter(board);
    const normal = readRectNormal(board);
    const candidate = createRectFromCenter({
      centerX: boardCenter.x + normal.x * (0.09 + 0.26 + 0.18),
      centerY: boardCenter.y + normal.y * (0.09 + 0.26 + 0.18),
      height: 0.52,
      id: "block-1",
      kind: "block",
      label: "Block 1",
      rotationDegrees: 30,
      width: 0.84,
    });

    expect(
      resolveAuthoringPlacement({
        candidate,
        entities: [board],
        maxSnapDistance: 0.12,
      }),
    ).toMatchObject({
      entity: candidate,
      status: "free",
    });
  });

  it("snaps a tilted block into exact contact on a tilted board face", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 30,
      width: 1.2,
    });
    const boardCenter = readCenter(board);
    const normal = readRectNormal(board);
    const resolution = resolveAuthoringPlacement({
      candidate: createRectFromCenter({
        centerX: boardCenter.x + normal.x * (0.09 + 0.26 - 0.04),
        centerY: boardCenter.y + normal.y * (0.09 + 0.26 - 0.04),
        height: 0.52,
        id: "block-1",
        kind: "block",
        label: "Block 1",
        rotationDegrees: 30,
        width: 0.84,
      }),
      entities: [board],
      maxSnapDistance: 0.12,
    });

    expect(resolution.status).toBe("snap");
    expect(resolution).toMatchObject({
      contactWithEntityId: "board-1",
    });

    if (resolution.status !== "snap") {
      throw new Error("expected a snapped placement");
    }

    const snappedCenter = readCenter(resolution.entity);

    expect(snappedCenter.x).toBeCloseTo(boardCenter.x + normal.x * (0.09 + 0.26), 6);
    expect(snappedCenter.y).toBeCloseTo(boardCenter.y + normal.y * (0.09 + 0.26), 6);
    expect(resolution.contactNormal.x).toBeCloseTo(normal.x, 6);
    expect(resolution.contactNormal.y).toBeCloseTo(normal.y, 6);
    expect(
      canPlaceAuthoringEntity({
        candidate: resolution.entity,
        entities: [board],
      }),
    ).toBe(true);
    expect(
      findAuthoringOverlap({
        candidate: resolution.entity,
        entities: [board],
      }),
    ).toBeNull();
  });

  it("snaps a ball near a board corner into touching contact", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 0,
      width: 1.2,
    });
    const boardCenter = readCenter(board);
    const corner = {
      x: boardCenter.x + board.width / 2,
      y: boardCenter.y - board.height / 2,
    };
    const cornerNormal = {
      x: Math.SQRT1_2,
      y: -Math.SQRT1_2,
    };
    const resolution = resolveAuthoringPlacement({
      candidate: createBallFromCenter({
        centerX: corner.x + cornerNormal.x * 0.09,
        centerY: corner.y + cornerNormal.y * 0.09,
        id: "ball-1",
        label: "Ball 1",
        radius: 0.12,
      }),
      entities: [board],
      maxSnapDistance: 0.12,
    });

    expect(resolution.status).toBe("snap");
    expect(resolution).toMatchObject({
      contactWithEntityId: "board-1",
    });

    if (resolution.status !== "snap") {
      throw new Error("expected a snapped placement");
    }

    const snappedCenter = readCenter(resolution.entity);

    expect(snappedCenter.x).toBeCloseTo(corner.x + cornerNormal.x * 0.12, 6);
    expect(snappedCenter.y).toBeCloseTo(corner.y + cornerNormal.y * 0.12, 6);
    expect(
      canPlaceAuthoringEntity({
        candidate: resolution.entity,
        entities: [board],
      }),
    ).toBe(true);
  });

  it("returns blocked for deep overlap that cannot be resolved within the snap distance", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 30,
      width: 1.2,
    });

    expect(
      resolveAuthoringPlacement({
        candidate: createRectFromCenter({
          centerX: 1.8,
          centerY: 1.4,
          height: 0.52,
          id: "block-1",
          kind: "block",
          label: "Block 1",
          rotationDegrees: 30,
          width: 0.84,
        }),
        entities: [board],
        maxSnapDistance: 0.05,
      }),
    ).toEqual({
      entity: null,
      status: "blocked",
    });
  });

  it("ignores the entity being moved when resolve is called with ignoreEntityId", () => {
    const board = createRectFromCenter({
      centerX: 1.8,
      centerY: 1.4,
      height: 0.18,
      id: "board-1",
      kind: "board",
      label: "Board 1",
      rotationDegrees: 30,
      width: 1.2,
    });

    expect(
      resolveAuthoringPlacement({
        candidate: board,
        entities: [board],
        ignoreEntityId: board.id,
        maxSnapDistance: 0.12,
      }),
    ).toMatchObject({
      entity: board,
      status: "free",
    });
  });

  it("uses a 0.12 m default snap distance in current scene units", () => {
    expect(getDefaultAuthoringSnapDistance("m")).toBeCloseTo(0.12, 6);
    expect(getDefaultAuthoringSnapDistance("cm")).toBeCloseTo(12, 6);
  });
});
