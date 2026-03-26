import { describe, expect, it } from "vitest";

import {
  clampPositionToFirstQuadrant,
  isPositionInFirstQuadrant,
  normalizeAuthoredPositionForCommit,
  quantizePositionForStorage,
  quantizeSceneLengthForStorage,
} from "./authoringDomain";

describe("authoringDomain", () => {
  it("quantizes meter values to 0.01 m storage precision", () => {
    expect(quantizeSceneLengthForStorage(0.9441115113329357, "m")).toBe(0.94);
  });

  it("uses stable toFixed-style semantics for halfway values", () => {
    expect(quantizeSceneLengthForStorage(0.945, "m")).toBe(0.94);
  });

  it("quantizes non-meter units to the equivalent 0.01 m storage precision", () => {
    expect(quantizeSceneLengthForStorage(94.41115113329357, "cm")).toBe(94);
    expect(quantizeSceneLengthForStorage(94.5, "cm")).toBe(94);
  });

  it("quantizes authored positions component-wise", () => {
    expect(
      quantizePositionForStorage(
        {
          x: 0.9441115113329357,
          y: 1.005,
        },
        "m",
      ),
    ).toEqual({
      x: 0.94,
      y: 1,
    });
  });

  it("keeps first-quadrant positions unchanged", () => {
    expect(isPositionInFirstQuadrant({ x: 0, y: 2.35 })).toBe(true);
    expect(clampPositionToFirstQuadrant({ x: 1.23, y: 4.56 })).toEqual({
      x: 1.23,
      y: 4.56,
    });
  });

  it("clamps negative coordinates to the first quadrant", () => {
    expect(isPositionInFirstQuadrant({ x: -0.01, y: 2.35 })).toBe(false);
    expect(clampPositionToFirstQuadrant({ x: -1.2, y: 0.34 })).toEqual({
      x: 0,
      y: 0.34,
    });
    expect(clampPositionToFirstQuadrant({ x: 0.67, y: -5.4 })).toEqual({
      x: 0.67,
      y: 0,
    });
  });

  it("normalizes authored commit positions deterministically", () => {
    const input = {
      x: -0.004,
      y: 0.9441115113329357,
    };

    expect(normalizeAuthoredPositionForCommit(input, "m")).toEqual({
      x: 0,
      y: 0.94,
    });
    expect(normalizeAuthoredPositionForCommit(input, "m")).toEqual({
      x: 0,
      y: 0.94,
    });
  });
});
