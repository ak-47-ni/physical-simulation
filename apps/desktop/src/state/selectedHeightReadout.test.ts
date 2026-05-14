import { describe, expect, it } from "vitest";

import { getBoardGuideSurface } from "./boardArcPlacement";
import {
  createSelectedBallHeightReadout,
  type SelectedBallHeightReadout,
} from "./selectedHeightReadout";

function round(value: number): number {
  return Number(value.toFixed(6));
}

describe("selectedHeightReadout", () => {
  it("computes surface drop and center drop for a ball that moves from a tilted board onto a level board", () => {
    const sourceBoard = {
      id: "board-1",
      kind: "board" as const,
      label: "Board 1",
      x: 1,
      y: 1.2,
      width: 2,
      height: 0.18,
      rotationDegrees: 30,
      mass: 5,
      friction: 0,
      restitution: 1,
      locked: true,
      velocityX: 0,
      velocityY: 0,
    };
    const sourceSurface = getBoardGuideSurface(sourceBoard);
    const startSurfacePoint = {
      x: round((sourceSurface.start.point.x + sourceSurface.end.point.x) / 2),
      y: round((sourceSurface.start.point.y + sourceSurface.end.point.y) / 2),
    };
    const startCenter = {
      x: round(startSurfacePoint.x + sourceSurface.normal.x * 0.24),
      y: round(startSurfacePoint.y + sourceSurface.normal.y * 0.24),
    };
    const targetBoard = {
      id: "board-2",
      kind: "board" as const,
      label: "Board 2",
      x: 3.6,
      y: round(startSurfacePoint.y + 1),
      width: 1.8,
      height: 0.18,
      rotationDegrees: 0,
      mass: 5,
      friction: 0,
      restitution: 1,
      locked: true,
      velocityX: 0,
      velocityY: 0,
    };
    const currentCenter = {
      x: round(targetBoard.x + targetBoard.width * 0.45),
      y: round(targetBoard.y - 0.24),
    };

    const readout = createSelectedBallHeightReadout({
      entities: [
        {
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: round(startCenter.x - 0.24),
          y: round(startCenter.y - 0.24),
          radius: 0.24,
          mass: 1,
          friction: 0,
          restitution: 1,
          locked: false,
          velocityX: 0,
          velocityY: 0,
        },
        sourceBoard,
        targetBoard,
      ],
      lengthUnit: "m",
      runtimeFrame: {
        frameNumber: 60,
        entities: [
          {
            id: "ball-1",
            transform: {
              x: currentCenter.x,
              y: currentCenter.y,
              rotation: 0,
            },
          },
        ],
      },
      selectedEntity: {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: round(startCenter.x - 0.24),
        y: round(startCenter.y - 0.24),
        radius: 0.24,
        mass: 1,
        friction: 0,
        restitution: 1,
        locked: false,
        velocityX: 0,
        velocityY: 0,
      },
    });

    expect(readout).not.toBeNull();
    expect(readout?.surfaceDrop).toBeCloseTo(1, 6);
    expect(readout?.centerDrop).toBeCloseTo(0.967846, 6);
    expect(readout?.offsetGap).toBeCloseTo(0.032154, 6);
  });

  it("returns null when the selected entity is not supported by boards at both endpoints", () => {
    const readout = createSelectedBallHeightReadout({
      entities: [
        {
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: 1,
          y: 1,
          radius: 0.24,
          mass: 1,
          friction: 0,
          restitution: 1,
          locked: false,
          velocityX: 0,
          velocityY: 0,
        },
      ],
      lengthUnit: "m",
      runtimeFrame: {
        frameNumber: 0,
        entities: [
          {
            id: "ball-1",
            transform: {
              x: 1.24,
              y: 1.24,
              rotation: 0,
            },
          },
        ],
      },
      selectedEntity: {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: 1,
        y: 1,
        radius: 0.24,
        mass: 1,
        friction: 0,
        restitution: 1,
        locked: false,
        velocityX: 0,
        velocityY: 0,
      },
    });

    expect(readout).toBeNull();
  });
});
