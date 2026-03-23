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

  it("converts screen pixels back into authoring world values for the selected unit", () => {
    const viewport = {
      lengthUnit: "cm" as const,
      pixelsPerMeter: 100,
    };

    expect(projectScreenPointToAuthoring({ x: 132, y: 176 }, viewport)).toEqual({
      x: 132,
      y: 176,
    });
  });

  it("projects SI runtime positions into screen pixels through the viewport scale", () => {
    const viewport = {
      lengthUnit: "cm" as const,
      pixelsPerMeter: 100,
    };

    expect(projectSiPointToScreen({ x: 1.57, y: 2.01 }, viewport)).toEqual({
      x: 157,
      y: 201,
    });
  });
});
