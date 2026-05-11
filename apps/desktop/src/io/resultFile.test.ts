import { describe, expect, it } from "vitest";

import { desktopAppVersion } from "../app-meta";
import { createInitialAuthoringState } from "../state/appEditorHelpers";
import { createSceneDocumentFromEditorState } from "../state/editorSceneDocument";
import { createSceneDisplaySettings } from "./sceneFile";
import {
  parseRuntimeResultFile,
  serializeRuntimeResultFile,
} from "./resultFile";

describe("runtime result file IO", () => {
  it("round-trips the scene snapshot, authoring settings, and precomputed runtime frames", () => {
    const authoringState = createInitialAuthoringState();
    const scene = createSceneDocumentFromEditorState({
      constraints: authoringState.constraints,
      entities: authoringState.entities,
    });
    const serialized = serializeRuntimeResultFile({
      appVersion: desktopAppVersion,
      authoring: authoringState.settings,
      createdAt: "2026-05-08T00:00:00.000Z",
      display: createSceneDisplaySettings({ showLabels: true }),
      frames: [
        {
          frame: {
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 1.32, y: 1.76 },
                velocity: { x: 0.6, y: 0 },
                acceleration: { x: 0, y: 10 },
              },
            ],
            frameNumber: 0,
          },
          timeSeconds: 0,
        },
        {
          frame: {
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 1.33, y: 1.77 },
                velocity: { x: 0.6, y: 0.17 },
                acceleration: { x: 0, y: 10 },
              },
            ],
            frameNumber: 1,
          },
          timeSeconds: 1 / 60,
        },
      ],
      precomputeDurationSeconds: 1,
      scene,
      selectedConstraintId: null,
      selectedEntityId: "ball-1",
      stepSeconds: 1 / 60,
    });

    const parsed = parseRuntimeResultFile(serialized);

    expect(parsed.format).toBe("physics-sandbox-result");
    expect(parsed.version).toBe(1);
    expect(parsed.appVersion).toBe(desktopAppVersion);
    expect(parsed.scene.entities).toEqual(scene.entities);
    expect(parsed.authoring.lengthUnit).toBe("m");
    expect(parsed.display.showLabels).toBe(true);
    expect(parsed.selectedEntityId).toBe("ball-1");
    expect(parsed.runtime.stepSeconds).toBe(1 / 60);
    expect(parsed.runtime.precomputeDurationSeconds).toBe(1);
    expect(parsed.runtime.frames).toHaveLength(2);
    expect(parsed.runtime.frames[1].frame?.entities[0]).toMatchObject({
      id: "ball-1",
      transform: { x: 1.33, y: 1.77 },
      velocity: { x: 0.6, y: 0.17 },
      acceleration: { x: 0, y: 10 },
    });
  });

  it("rejects unsupported result payloads", () => {
    expect(() =>
      parseRuntimeResultFile(
        JSON.stringify({
          format: "physics-sandbox-result",
          version: 99,
          runtime: { frames: [] },
        }),
      ),
    ).toThrow(/unsupported runtime result file format/i);
  });
});
