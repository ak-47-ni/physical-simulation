import {
  cloneSceneDocument,
  createEmptySceneDocument,
  type SceneDocument,
  type Vector2,
} from "../../../../packages/scene-schema/src";

import type { RuntimeFrameEntityView, RuntimeFrameView } from "../state/runtimeBridge";
import {
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "../state/sceneAuthoringSettings";
import {
  createSceneDisplaySettings,
  type SceneDisplaySettings,
} from "./sceneFile";

export const RUNTIME_RESULT_FILE_FORMAT = "physics-sandbox-result";
export const RUNTIME_RESULT_FILE_VERSION = 1;
export const RUNTIME_RESULT_STEP_SECONDS = 1 / 60;

export type RuntimeResultFrame = {
  frame: RuntimeFrameView | null;
  timeSeconds: number;
};

export type RuntimeResultFilePayload = {
  appVersion: string;
  authoring: SceneAuthoringSettings;
  createdAt: string;
  display: SceneDisplaySettings;
  format: typeof RUNTIME_RESULT_FILE_FORMAT;
  runtime: {
    frames: RuntimeResultFrame[];
    precomputeDurationSeconds: number;
    stepSeconds: number;
  };
  scene: SceneDocument;
  selectedConstraintId: string | null;
  selectedEntityId: string | null;
  version: typeof RUNTIME_RESULT_FILE_VERSION;
};

export type RuntimeResultFileInput = {
  appVersion: string;
  authoring?: Partial<SceneAuthoringSettings>;
  createdAt?: string;
  display: SceneDisplaySettings;
  frames: readonly RuntimeResultFrame[];
  precomputeDurationSeconds: number;
  scene: SceneDocument;
  selectedConstraintId: string | null;
  selectedEntityId: string | null;
  stepSeconds?: number;
};

export function serializeRuntimeResultFile(input: RuntimeResultFileInput): string {
  const payload: RuntimeResultFilePayload = {
    appVersion: input.appVersion,
    authoring: createSceneAuthoringSettings(input.authoring),
    createdAt: input.createdAt ?? new Date().toISOString(),
    display: createSceneDisplaySettings(input.display),
    format: RUNTIME_RESULT_FILE_FORMAT,
    runtime: {
      frames: input.frames.map(cloneRuntimeResultFrame),
      precomputeDurationSeconds: input.precomputeDurationSeconds,
      stepSeconds: input.stepSeconds ?? RUNTIME_RESULT_STEP_SECONDS,
    },
    scene: cloneSceneDocument(input.scene),
    selectedConstraintId: input.selectedConstraintId,
    selectedEntityId: input.selectedEntityId,
    version: RUNTIME_RESULT_FILE_VERSION,
  };

  return JSON.stringify(payload, null, 2);
}

export function parseRuntimeResultFile(serialized: string): RuntimeResultFilePayload {
  const parsed = JSON.parse(serialized) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Unsupported runtime result file format.");
  }

  if (
    parsed.format !== RUNTIME_RESULT_FILE_FORMAT ||
    parsed.version !== RUNTIME_RESULT_FILE_VERSION
  ) {
    throw new Error("Unsupported runtime result file format.");
  }

  const runtime = readRecord(parsed.runtime, "runtime");
  const frames = readArray(runtime.frames, "runtime.frames").map(parseRuntimeResultFrame);
  const precomputeDurationSeconds = readNumber(
    runtime.precomputeDurationSeconds,
    "runtime.precomputeDurationSeconds",
  );
  const stepSeconds = readNumber(runtime.stepSeconds, "runtime.stepSeconds");

  return {
    appVersion: readString(parsed.appVersion, "appVersion"),
    authoring: createSceneAuthoringSettings(readOptionalRecord(parsed.authoring)),
    createdAt: readString(parsed.createdAt, "createdAt"),
    display: createSceneDisplaySettings(readOptionalRecord(parsed.display)),
    format: RUNTIME_RESULT_FILE_FORMAT,
    runtime: {
      frames,
      precomputeDurationSeconds,
      stepSeconds,
    },
    scene: cloneSceneDocument({
      ...createEmptySceneDocument(),
      ...readRecord(parsed.scene, "scene"),
      analyzers: Array.isArray(readOptionalRecord(parsed.scene).analyzers)
        ? (readOptionalRecord(parsed.scene).analyzers as SceneDocument["analyzers"])
        : [],
      annotations: Array.isArray(readOptionalRecord(parsed.scene).annotations)
        ? (readOptionalRecord(parsed.scene).annotations as SceneDocument["annotations"])
        : [],
      constraints: Array.isArray(readOptionalRecord(parsed.scene).constraints)
        ? (readOptionalRecord(parsed.scene).constraints as SceneDocument["constraints"])
        : [],
      entities: Array.isArray(readOptionalRecord(parsed.scene).entities)
        ? (readOptionalRecord(parsed.scene).entities as SceneDocument["entities"])
        : [],
      forceSources: Array.isArray(readOptionalRecord(parsed.scene).forceSources)
        ? (readOptionalRecord(parsed.scene).forceSources as SceneDocument["forceSources"])
        : [],
    }),
    selectedConstraintId: readNullableString(parsed.selectedConstraintId, "selectedConstraintId"),
    selectedEntityId: readNullableString(parsed.selectedEntityId, "selectedEntityId"),
    version: RUNTIME_RESULT_FILE_VERSION,
  };
}

function cloneRuntimeResultFrame(sample: RuntimeResultFrame): RuntimeResultFrame {
  return {
    frame: sample.frame ? cloneRuntimeFrame(sample.frame) : null,
    timeSeconds: sample.timeSeconds,
  };
}

function cloneRuntimeFrame(frame: RuntimeFrameView): RuntimeFrameView {
  return {
    frameNumber: frame.frameNumber,
    entities: frame.entities.map(cloneRuntimeFrameEntity),
  };
}

function cloneRuntimeFrameEntity(entity: RuntimeFrameEntityView): RuntimeFrameEntityView {
  return {
    id: entity.id,
    transform: { ...entity.transform },
    velocity: entity.velocity ? { ...entity.velocity } : undefined,
    acceleration: entity.acceleration ? { ...entity.acceleration } : undefined,
  };
}

function parseRuntimeResultFrame(value: unknown): RuntimeResultFrame {
  const sample = readRecord(value, "runtime.frames[]");
  const frameValue = sample.frame;

  return {
    frame: frameValue === null ? null : parseRuntimeFrame(frameValue),
    timeSeconds: readNumber(sample.timeSeconds, "runtime.frames[].timeSeconds"),
  };
}

function parseRuntimeFrame(value: unknown): RuntimeFrameView {
  const frame = readRecord(value, "runtime.frames[].frame");

  return {
    frameNumber: readNumber(frame.frameNumber, "runtime.frames[].frame.frameNumber"),
    entities: readArray(frame.entities, "runtime.frames[].frame.entities").map(
      parseRuntimeFrameEntity,
    ),
  };
}

function parseRuntimeFrameEntity(value: unknown): RuntimeFrameEntityView {
  const entity = readRecord(value, "runtime.frames[].frame.entities[]");

  return {
    id: readString(entity.id, "runtime.frames[].frame.entities[].id"),
    transform: parseRuntimeTransform(entity.transform),
    velocity: parseOptionalVector(entity.velocity, "runtime.frames[].frame.entities[].velocity"),
    acceleration: parseOptionalVector(
      entity.acceleration,
      "runtime.frames[].frame.entities[].acceleration",
    ),
  };
}

function parseRuntimeTransform(value: unknown): RuntimeFrameEntityView["transform"] {
  const transform = readRecord(value, "runtime.frames[].frame.entities[].transform");

  return {
    rotation: readNumber(transform.rotation, "runtime.frames[].frame.entities[].transform.rotation"),
    x: readNumber(transform.x, "runtime.frames[].frame.entities[].transform.x"),
    y: readNumber(transform.y, "runtime.frames[].frame.entities[].transform.y"),
  };
}

function parseOptionalVector(value: unknown, path: string): Vector2 | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const vector = readRecord(value, path);

  return {
    x: readNumber(vector.x, `${path}.x`),
    y: readNumber(vector.y, `${path}.y`),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid runtime result file value at ${path}.`);
  }

  return value;
}

function readOptionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid runtime result file value at ${path}.`);
  }

  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid runtime result file value at ${path}.`);
  }

  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid runtime result file value at ${path}.`);
  }

  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  return readString(value, path);
}
