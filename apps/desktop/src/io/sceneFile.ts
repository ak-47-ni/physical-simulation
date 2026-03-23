import {
  cloneSceneDocument,
  createEmptySceneDocument,
  type SceneDocument,
} from "../../../../packages/scene-schema/src";
import {
  createDefaultSceneAuthoringSettings,
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "../state/sceneAuthoringSettings";

export type SceneDisplaySettings = {
  gridVisible: boolean;
  showForceVectors: boolean;
  showLabels: boolean;
  showTrajectories: boolean;
  showVelocityVectors: boolean;
};

type LegacySceneFilePayload = {
  format: "physics-sandbox-scene";
  version: 1;
  scene: SceneDocument;
  selectedConstraintId: string | null;
  display: SceneDisplaySettings;
  selectedEntityId: string | null;
};

export type SceneFilePayload = {
  format: "physics-sandbox-scene";
  version: 2;
  scene: SceneDocument;
  authoring: SceneAuthoringSettings;
  selectedConstraintId: string | null;
  display: SceneDisplaySettings;
  selectedEntityId: string | null;
};

type SceneFileInput = {
  authoring?: Partial<SceneAuthoringSettings>;
  scene: SceneDocument;
  selectedConstraintId: string | null;
  display: SceneDisplaySettings;
  selectedEntityId: string | null;
};

export function createSceneDisplaySettings(
  overrides: Partial<SceneDisplaySettings> = {},
): SceneDisplaySettings {
  return {
    gridVisible: true,
    showForceVectors: false,
    showLabels: false,
    showTrajectories: false,
    showVelocityVectors: false,
    ...overrides,
  };
}

export function serializeSceneFile(input: SceneFileInput): string {
  const payload: SceneFilePayload = {
    format: "physics-sandbox-scene",
    version: 2,
    scene: input.scene,
    authoring: createSceneAuthoringSettings(input.authoring),
    selectedConstraintId: input.selectedConstraintId,
    display: createSceneDisplaySettings(input.display),
    selectedEntityId: input.selectedEntityId,
  };

  return JSON.stringify(payload, null, 2);
}

export function parseSceneFile(serialized: string): SceneFilePayload {
  const parsed = JSON.parse(serialized) as Partial<SceneFilePayload | LegacySceneFilePayload>;

  if (
    parsed.format !== "physics-sandbox-scene" ||
    (parsed.version !== 1 && parsed.version !== 2)
  ) {
    throw new Error("Unsupported scene file format.");
  }

  return {
    format: "physics-sandbox-scene",
    version: 2,
    scene: cloneSceneDocument({
      ...createEmptySceneDocument(),
      ...parsed.scene,
      analyzers: parsed.scene?.analyzers ?? [],
      annotations: parsed.scene?.annotations ?? [],
      constraints: parsed.scene?.constraints ?? [],
      entities: parsed.scene?.entities ?? [],
      forceSources: parsed.scene?.forceSources ?? [],
    }),
    authoring:
      parsed.version === 2
        ? createSceneAuthoringSettings(parsed.authoring)
        : createDefaultSceneAuthoringSettings(),
    selectedConstraintId: parsed.selectedConstraintId ?? null,
    display: createSceneDisplaySettings(parsed.display),
    selectedEntityId: parsed.selectedEntityId ?? null,
  };
}
