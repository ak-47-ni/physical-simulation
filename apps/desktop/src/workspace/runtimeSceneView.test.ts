import { describe, expect, it } from "vitest";

import type { RuntimeFrameView } from "../state/runtimeBridge";
import type { EditorSceneEntity } from "../state/editorStore";
import {
  projectRuntimeSceneEntities,
  type WorkspaceSceneEntity,
} from "./runtimeSceneView";
import type { UnitViewport } from "./unitViewport";

const meterViewport: UnitViewport = {
  lengthUnit: "m",
  pixelsPerMeter: 100,
};

function createBallEntity(): EditorSceneEntity {
  return {
    id: "ball-1",
    kind: "ball",
    label: "Ball 1",
    x: 1.2,
    y: 1.8,
    radius: 0.24,
    mass: 1.2,
    friction: 0.14,
    restitution: 1,
    locked: true,
    velocityX: 8,
    velocityY: -4,
  };
}

function createBoardEntity(): EditorSceneEntity {
  return {
    id: "board-1",
    kind: "board",
    label: "Board 1",
    x: 3.2,
    y: 2.6,
    width: 1.2,
    height: 0.18,
    mass: 5,
    friction: 0.42,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  };
}

function createRotatedBoardEntity(rotationDegrees: number): WorkspaceSceneEntity {
  return {
    ...createBoardEntity(),
    rotationDegrees,
  };
}

function createBlockEntity(): EditorSceneEntity {
  return {
    id: "block-1",
    kind: "block",
    label: "Block 1",
    x: 2.2,
    y: 2.4,
    width: 0.84,
    height: 0.52,
    mass: 2.8,
    friction: 0.36,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  };
}

function createRotatedBlockEntity(rotationDegrees: number): WorkspaceSceneEntity {
  return {
    ...createBlockEntity(),
    rotationDegrees,
  };
}

function createPolygonEntity(): EditorSceneEntity {
  return {
    id: "polygon-1",
    kind: "polygon",
    label: "Polygon 1",
    x: 4.2,
    y: 1.8,
    width: 0.76,
    height: 0.76,
    mass: 2.2,
    friction: 0.28,
    restitution: 1,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  };
}

function createRuntimeFrame(overrides: Partial<RuntimeFrameView> = {}): RuntimeFrameView {
  return {
    frameNumber: 12,
    entities: [],
    ...overrides,
  };
}

describe("projectRuntimeSceneEntities", () => {
  it("projects a ball runtime center into workspace top-left coordinates", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createBallEntity()],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "ball-1",
            transform: {
              x: 2.6,
              y: 3.12,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected).toEqual([
      expect.objectContaining({
        id: "ball-1",
        x: 236,
        y: 288,
        radius: 24,
      }),
    ]);
  });

  it("projects sized bodies without losing their dimensions", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createBoardEntity()],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "board-1",
            transform: {
              x: 4.6,
              y: 2.71,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected).toEqual([
      expect.objectContaining({
        id: "board-1",
        x: 400,
        y: 262,
        width: 120,
        height: 18,
      }),
    ]);
  });

  it("keeps block and polygon dimensions rigid while runtime centers move", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createBlockEntity(), createPolygonEntity()],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "block-1",
            transform: {
              x: 2.92,
              y: 2.66,
              rotation: 0,
            },
          },
          {
            id: "polygon-1",
            transform: {
              x: 4.58,
              y: 2.18,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected).toEqual([
      expect.objectContaining({
        id: "block-1",
        x: 250,
        y: 240,
        width: 84,
        height: 52,
      }),
      expect.objectContaining({
        id: "polygon-1",
        x: 420,
        y: 180,
        width: 76,
        height: 76,
      }),
    ]);
  });

  it("preserves editor-authored labels and lock state while projecting runtime positions", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createBallEntity()],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "ball-1",
            transform: {
              x: 2.6,
              y: 3.12,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "ball-1",
        label: "Ball 1",
        locked: true,
        velocityX: 8,
        velocityY: -4,
      }),
    );
  });

  it("preserves runtime or authored rotation for rotated boards", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createRotatedBoardEntity(18)],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "board-1",
            transform: {
              x: 4.6,
              y: 2.71,
              rotation: Math.PI / 6,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "board-1",
        rotationDegrees: 30,
      }),
    );
  });

  it("falls back to authored board rotation when runtime rotation is zero", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createRotatedBoardEntity(18)],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "board-1",
            transform: {
              x: 4.6,
              y: 2.71,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "board-1",
        rotationDegrees: 18,
      }),
    );
  });

  it("falls back to authored block rotation when runtime rotation rounds to zero", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createRotatedBlockEntity(22)],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "block-1",
            transform: {
              x: 2.62,
              y: 2.66,
              rotation: 0.00001,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "block-1",
        rotationDegrees: 22,
        width: 84,
        height: 52,
      }),
    );
  });

  it("falls back to editor positions when runtime data is missing for an entity", () => {
    const ball = createBallEntity();
    const board = createBoardEntity();

    const projected = projectRuntimeSceneEntities({
      editorEntities: [ball, board],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "ball-1",
            transform: {
              x: 2.6,
              y: 3.12,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "ball-1",
        x: 236,
        y: 288,
      }),
    );
    expect(projected[1]).toEqual(
      expect.objectContaining({
        id: "board-1",
        x: 320,
        y: 260,
        width: 120,
        height: 18,
      }),
    );
  });

  it("keeps runtime entities aligned to the visible x=0 and y=0 boundaries", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createBallEntity(), createRotatedBoardEntity(18)],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "ball-1",
            transform: {
              x: 0.24,
              y: 0.24,
              rotation: 0,
            },
          },
          {
            id: "board-1",
            transform: {
              x: 0.6,
              y: 0.09,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: meterViewport,
    });

    expect(projected).toEqual([
      expect.objectContaining({
        id: "ball-1",
        x: 0,
        y: 0,
      }),
      expect.objectContaining({
        id: "board-1",
        x: 0,
        y: 0,
        rotationDegrees: 18,
      }),
    ]);
  });

  it("applies viewport offsets at the first-quadrant boundary without adding negative padding", () => {
    const projected = projectRuntimeSceneEntities({
      editorEntities: [createRotatedBlockEntity(24)],
      runtimeFrame: createRuntimeFrame({
        entities: [
          {
            id: "block-1",
            transform: {
              x: 0.42,
              y: 0.26,
              rotation: 0,
            },
          },
        ],
      }),
      viewport: {
        ...meterViewport,
        offsetPx: { x: 28, y: 16 },
      },
    });

    expect(projected[0]).toEqual(
      expect.objectContaining({
        id: "block-1",
        x: 28,
        y: 16,
        width: 84,
        height: 52,
        rotationDegrees: 24,
      }),
    );
  });
});
