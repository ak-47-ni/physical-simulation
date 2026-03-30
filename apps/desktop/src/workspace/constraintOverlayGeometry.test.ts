import { describe, expect, it } from "vitest";

import {
  createArcOverlayGeometry,
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

  it("creates stable curved arc geometry for a known quarter-turn", () => {
    const arc = createArcOverlayGeometry({
      center: { x: 200, y: 200 },
      endAngleDegrees: 90,
      radius: 100,
      startAngleDegrees: 0,
    });

    expect(arc.startPoint).toEqual({ x: 300, y: 200 });
    expect(arc.endPoint).toEqual({ x: 200, y: 100 });
    expect(arc.bounds).toEqual({
      height: 116,
      left: 192,
      top: 92,
      width: 116,
    });
    expect(arc.pathData.startsWith("M 108 108")).toBe(true);
  });
});
