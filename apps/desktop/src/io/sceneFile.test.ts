import { describe, expect, it } from "vitest";

import { createEmptySceneDocument, createUserPolygonEntity } from "../../../../packages/scene-schema/src";
import {
  createSceneDisplaySettings,
  parseSceneFile,
  serializeSceneFile,
} from "./sceneFile";

describe("scene file IO", () => {
  it("round-trips scene JSON while preserving annotations and display settings", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push(
      createUserPolygonEntity({
        id: "ramp-1",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 },
        ],
      }),
    );
    scene.annotations.push({
      id: "stroke-1",
      points: [
        { x: 8, y: 12 },
        { x: 24, y: 30 },
      ],
    });

    const display = createSceneDisplaySettings({
      gridVisible: false,
      showTrajectories: true,
      showLabels: true,
    });

    const serialized = serializeSceneFile({
      display,
      scene,
      selectedEntityId: "ramp-1",
    });
    const parsed = parseSceneFile(serialized);

    expect(parsed.scene.schemaVersion).toBe(1);
    expect(parsed.scene.annotations).toEqual(scene.annotations);
    expect(parsed.display).toEqual({
      gridVisible: false,
      showForceVectors: false,
      showLabels: true,
      showTrajectories: true,
      showVelocityVectors: false,
    });
    expect(parsed.selectedEntityId).toBe("ramp-1");
  });
});
