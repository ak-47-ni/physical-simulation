import { describe, expect, it } from "vitest";

import {
  createDefaultSceneAuthoringSettings,
  createSceneAuthoringSettings,
} from "./sceneAuthoringSettings";

describe("sceneAuthoringSettings", () => {
  it("creates stable default authoring settings for classroom scenes", () => {
    expect(createDefaultSceneAuthoringSettings()).toEqual({
      gravity: 9.8,
      lengthUnit: "m",
      velocityUnit: "m/s",
      massUnit: "kg",
      pixelsPerMeter: 1,
    });
  });

  it("allows overriding the default authoring settings shape", () => {
    expect(
      createSceneAuthoringSettings({
        gravity: 981,
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
        pixelsPerMeter: 160,
      }),
    ).toEqual({
      gravity: 981,
      lengthUnit: "cm",
      velocityUnit: "cm/s",
      massUnit: "g",
      pixelsPerMeter: 160,
    });
  });
});
