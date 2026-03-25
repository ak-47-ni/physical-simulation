import { describe, expect, it } from "vitest";

import {
  cartesianVelocityToPolar,
  normalizeDirectionDegrees,
  polarVelocityToCartesian,
} from "./velocityPolar";

describe("velocityPolar", () => {
  it("normalizes direction angles into the classroom 0 to 360 range", () => {
    expect(normalizeDirectionDegrees(-90)).toBe(270);
    expect(normalizeDirectionDegrees(450)).toBe(90);
  });

  it("converts cartesian velocities into speed and direction using +x as 0 degrees", () => {
    expect(cartesianVelocityToPolar({ velocityX: 0, velocityY: 5 })).toEqual({
      directionDegrees: 90,
      speed: 5,
    });
    expect(cartesianVelocityToPolar({ velocityX: -3, velocityY: 0 })).toEqual({
      directionDegrees: 180,
      speed: 3,
    });
  });

  it("converts polar speed and direction back into cartesian velocity", () => {
    const upward = polarVelocityToCartesian({ directionDegrees: 90, speed: 6 });
    const diagonal = polarVelocityToCartesian({ directionDegrees: 225, speed: Math.sqrt(8) });

    expect(upward.velocityX).toBeCloseTo(0);
    expect(upward.velocityY).toBeCloseTo(6);
    expect(diagonal.velocityX).toBeCloseTo(-2);
    expect(diagonal.velocityY).toBeCloseTo(-2);
  });
});
