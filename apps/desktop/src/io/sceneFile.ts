import type { AnnotationStroke, SceneDocument } from "../../../../packages/scene-schema/src";
import { createEmptySceneDocument } from "../../../../packages/scene-schema/src";

export type SceneDisplaySettings = {
  gridVisible: boolean;
  showForceVectors: boolean;
  showLabels: boolean;
  showTrajectories: boolean;
  showVelocityVectors: boolean;
};

export type SceneFilePayload = {
  format: "physics-sandbox-scene";
  version: 1;
  scene: SceneDocument;
  display: SceneDisplaySettings;
  selectedEntityId: string | null;
};

type SceneFileInput = {
  scene: SceneDocument;
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
    version: 1,
    scene: input.scene,
    display: createSceneDisplaySettings(input.display),
    selectedEntityId: input.selectedEntityId,
  };

  return JSON.stringify(payload, null, 2);
}

export function parseSceneFile(serialized: string): SceneFilePayload {
  const parsed = JSON.parse(serialized) as Partial<SceneFilePayload>;

  if (parsed.format !== "physics-sandbox-scene" || parsed.version !== 1) {
    throw new Error("Unsupported scene file format.");
  }

  const scene = parsed.scene ?? createEmptySceneDocument();

  return {
    format: "physics-sandbox-scene",
    version: 1,
    scene: {
      ...createEmptySceneDocument(),
      ...scene,
      annotations: cloneAnnotations(scene.annotations ?? []),
    },
    display: createSceneDisplaySettings(parsed.display),
    selectedEntityId: parsed.selectedEntityId ?? null,
  };
}

function cloneAnnotations(strokes: AnnotationStroke[]): AnnotationStroke[] {
  return strokes.map((stroke) => ({
    id: stroke.id,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}
