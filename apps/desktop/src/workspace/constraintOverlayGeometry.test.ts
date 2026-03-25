import { describe, expect, it } from "vitest";

import {
  createConstraintLineGeometry,
  createSpringOverlayGeometry,
} from "./constraintOverlayGeometry";

describe("constraintOverlayGeometry", () => {
  it("creates a zigzag spring path instead of a flat bar", () => {
    const spring = createSpringOverlayGeometry({ x: 0, y: 0 }, { x: 120, y: 0 });
    const uniqueYValues = new Set(spring.points.map((point) => point.y));

    expect(uniqueYValues.size).toBeGreaterThan(2);
  });

  it("keeps the clickable hitbox wider than the visible spring stroke", () => {
    const line = createConstraintLineGeometry({ x: 0, y: 0 }, { x: 120, y: 36 });

    expect(line.hitboxThickness).toBeGreaterThan(line.strokeThickness);
    expect(line.length).toBeCloseTo(125.28, 2);
  });
});
