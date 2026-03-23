import { describe, expect, it } from "vitest";

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
});
