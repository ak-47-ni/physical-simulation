import { describe, expect, it } from "vitest";

import { createDefaultSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { createInitialSceneEntities } from "../state/editorStore";
import { createSceneDocumentFromEditorState } from "../state/editorSceneDocument";
import {
  createSceneDisplaySettings,
  parseSceneFile,
  serializeSceneFile,
} from "./sceneFile";

describe("scene file IO", () => {
  it("round-trips typed constraints, gravity, and selection metadata", () => {
    const scene = createSceneDocumentFromEditorState({
      annotations: [
        {
          id: "stroke-1",
          points: [
            { x: 8, y: 12 },
            { x: 24, y: 30 },
          ],
        },
      ],
      constraints: [
        {
          entityAId: "ball-1",
          entityBId: "board-1",
          id: "spring-1",
          kind: "spring",
          label: "Spring 1",
          restLength: 236,
          stiffness: 24,
        },
        {
          axis: { x: 180, y: 60 },
          entityId: "ball-1",
          id: "track-1",
          kind: "track",
          label: "Track 1",
          origin: { x: 156, y: 200 },
        },
      ],
      entities: createInitialSceneEntities(),
    });

    const display = createSceneDisplaySettings({
      gridVisible: false,
      showTrajectories: true,
      showLabels: true,
    });

    const serialized = serializeSceneFile({
      display,
      scene,
      selectedConstraintId: "track-1",
      selectedEntityId: "ball-1",
    });
    const parsed = parseSceneFile(serialized);

    expect(parsed.scene.schemaVersion).toBe(1);
    expect(parsed.scene.annotations).toEqual(scene.annotations);
    expect(parsed.scene.constraints).toEqual(scene.constraints);
    expect(parsed.scene.forceSources).toEqual(scene.forceSources);
    expect(parsed.display).toEqual({
      gridVisible: false,
      showForceVectors: false,
      showLabels: true,
      showTrajectories: true,
      showVelocityVectors: false,
    });
    expect(parsed.selectedConstraintId).toBe("track-1");
    expect(parsed.selectedEntityId).toBe("ball-1");
  });

  it("serializes and parses persisted scene authoring settings", () => {
    const scene = createSceneDocumentFromEditorState({
      entities: createInitialSceneEntities(),
    });

    const serialized = serializeSceneFile({
      authoring: {
        gravity: 981,
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
        pixelsPerMeter: 160,
      },
      display: createSceneDisplaySettings(),
      scene,
      selectedConstraintId: null,
      selectedEntityId: "ball-1",
    });
    const parsed = parseSceneFile(serialized);

    expect(parsed.version).toBe(2);
    expect(parsed.authoring).toEqual({
      gravity: 981,
      lengthUnit: "cm",
      velocityUnit: "cm/s",
      massUnit: "g",
      pixelsPerMeter: 160,
    });
  });

  it("falls back to default authoring settings when parsing a legacy scene file", () => {
    const legacySerialized = JSON.stringify({
      format: "physics-sandbox-scene",
      version: 1,
      scene: createSceneDocumentFromEditorState({
        entities: createInitialSceneEntities(),
      }),
      selectedConstraintId: null,
      display: createSceneDisplaySettings({
        showLabels: true,
      }),
      selectedEntityId: "board-1",
    });

    const parsed = parseSceneFile(legacySerialized);

    expect(parsed.version).toBe(2);
    expect(parsed.authoring).toEqual(createDefaultSceneAuthoringSettings());
    expect(parsed.selectedEntityId).toBe("board-1");
    expect(parsed.display.showLabels).toBe(true);
  });
});
