import type { LengthUnit, MassUnit, VelocityUnit } from "./sceneUnits";

export type SceneAuthoringSettings = {
  gravity: number;
  lengthUnit: LengthUnit;
  velocityUnit: VelocityUnit;
  massUnit: MassUnit;
  pixelsPerMeter: number;
};

export const DEFAULT_PIXELS_PER_METER = 100;
export const DEFAULT_SCENE_AUTHORING_SETTINGS: SceneAuthoringSettings = {
  gravity: 9.8,
  lengthUnit: "m",
  velocityUnit: "m/s",
  massUnit: "kg",
  pixelsPerMeter: DEFAULT_PIXELS_PER_METER,
};

export function createDefaultSceneAuthoringSettings(): SceneAuthoringSettings {
  return cloneSceneAuthoringSettings(DEFAULT_SCENE_AUTHORING_SETTINGS);
}

export function createSceneAuthoringSettings(
  overrides: Partial<SceneAuthoringSettings> = {},
): SceneAuthoringSettings {
  return {
    ...createDefaultSceneAuthoringSettings(),
    ...overrides,
  };
}

export function cloneSceneAuthoringSettings(
  settings: SceneAuthoringSettings,
): SceneAuthoringSettings {
  return {
    gravity: settings.gravity,
    lengthUnit: settings.lengthUnit,
    velocityUnit: settings.velocityUnit,
    massUnit: settings.massUnit,
    pixelsPerMeter: settings.pixelsPerMeter,
  };
}
