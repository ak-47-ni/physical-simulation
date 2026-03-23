import { describe, expect, it } from "vitest";

import {
  convertLengthValue,
  convertMassValue,
  convertVelocityValue,
  getGravityUnitLabel,
} from "./sceneUnits";

describe("sceneUnits", () => {
  it("converts authored values between supported classroom units", () => {
    expect(convertLengthValue(1, "m", "cm")).toBe(100);
    expect(convertLengthValue(125, "cm", "m")).toBe(1.25);

    expect(convertVelocityValue(1, "m/s", "cm/s")).toBe(100);
    expect(convertVelocityValue(250, "cm/s", "m/s")).toBe(2.5);

    expect(convertMassValue(1, "kg", "g")).toBe(1000);
    expect(convertMassValue(750, "g", "kg")).toBe(0.75);
  });

  it("derives gravity display labels from the selected length unit", () => {
    expect(getGravityUnitLabel("m")).toBe("m/s²");
    expect(getGravityUnitLabel("cm")).toBe("cm/s²");
  });
});
