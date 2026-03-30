import { describe, expect, it } from "vitest";

import { createArcTrackConstraintFromBallAndCenter } from "./createArcTrackConstraint";

describe("createArcTrackConstraintFromBallAndCenter", () => {
  it("creates an inside arc-track whose radius matches the ball-center distance", () => {
    const constraint = createArcTrackConstraintFromBallAndCenter({
      ball: {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: 2,
        y: 2,
        radius: 0.5,
        mass: 1,
        friction: 0.12,
        restitution: 1,
        locked: false,
        velocityX: 0,
        velocityY: 0,
      },
      center: { x: 1, y: 2.5 },
      id: "arc-track-1",
    });

    expect(constraint).toEqual({
      center: { x: 1, y: 2.5 },
      endAngleDegrees: 90,
      entityId: "ball-1",
      id: "arc-track-1",
      kind: "arc-track",
      radius: 1.5,
      side: "inside",
      startAngleDegrees: -90,
    });
  });

  it("centers the default span on the current ball angle in cartesian degrees", () => {
    const constraint = createArcTrackConstraintFromBallAndCenter({
      ball: {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: 1.5,
        y: 2.5,
        radius: 0.5,
        mass: 1,
        friction: 0.12,
        restitution: 1,
        locked: false,
        velocityX: 0,
        velocityY: 0,
      },
      center: { x: 1, y: 4 },
      id: "arc-track-2",
    });

    expect(constraint.radius).toBeCloseTo(1.414214, 6);
    expect(constraint.startAngleDegrees).toBeCloseTo(-45, 6);
    expect(constraint.endAngleDegrees).toBeCloseTo(135, 6);
  });
});
