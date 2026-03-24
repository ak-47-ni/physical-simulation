import { describe, expect, it } from "vitest";

import {
  authoringLengthToScreenPixels,
  projectAuthoringPointToScreen,
  projectScreenPointToAuthoring,
  projectSiPointToScreen,
} from "./unitViewport";

describe("unitViewport", () => {
  it("projects authoring world positions in meters through the configured pixel scale", () => {
    const viewport = {
      lengthUnit: "m" as const,
      pixelsPerMeter: 100,
    };

    expect(authoringLengthToScreenPixels(1.2, viewport)).toBe(120);
    expect(projectAuthoringPointToScreen({ x: 1.32, y: 1.76 }, viewport)).toEqual({
      x: 132,
      y: 176,
    });
  });

  it("projects authoring world positions in centimeters through the same meter-based scale", () => {
    const viewport = {
      lengthUnit: "cm" as const,
      pixelsPerMeter: 100,
    };

    expect(authoringLengthToScreenPixels(132, viewport)).toBe(132);
    expect(projectAuthoringPointToScreen({ x: 132, y: 176 }, viewport)).toEqual({
      x: 132,
      y: 176,
    });
  });

  it("adds the viewport camera offset when projecting authored points to screen space", () => {
    const viewport = {
      lengthUnit: "m" as const,
      pixelsPerMeter: 100,
      offsetPx: { x: 48, y: -24 },
    };

    expect(projectAuthoringPointToScreen({ x: 1.32, y: 1.76 }, viewport)).toEqual({
      x: 180,
      y: 152,
    });
  });

  it("converts screen pixels back into authoring world values for the selected unit", () => {
    const viewport = {
      lengthUnit: "cm" as const,
      pixelsPerMeter: 100,
      offsetPx: { x: 18, y: -12 },
    };

    expect(projectScreenPointToAuthoring({ x: 150, y: 164 }, viewport)).toEqual({
      x: 132,
      y: 176,
    });
  });

  it("round-trips authored points through the viewport offset without changing world coordinates", () => {
    const viewport = {
      lengthUnit: "m" as const,
      pixelsPerMeter: 80,
      offsetPx: { x: -36, y: 22 },
    };
    const authoredPoint = { x: 2.4, y: 1.15 };

    expect(
      projectScreenPointToAuthoring(projectAuthoringPointToScreen(authoredPoint, viewport), viewport),
    ).toEqual({
      x: 2.4,
      y: 1.15,
    });
  });

  it("projects SI runtime positions into screen pixels through the viewport scale", () => {
    const viewport = {
      lengthUnit: "cm" as const,
      pixelsPerMeter: 100,
      offsetPx: { x: 20, y: 12 },
    };

    expect(projectSiPointToScreen({ x: 1.57, y: 2.01 }, viewport)).toEqual({
      x: 177,
      y: 213,
    });
  });
});
