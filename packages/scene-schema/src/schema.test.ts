import { describe, expect, it } from "vitest";

import {
  SCENE_SCHEMA_VERSION,
  createEmptySceneDocument,
  createRuntimeFramePayload,
  createUserPolygonEntity,
  requiresRuntimeRebuild,
} from "./index";

describe("scene schema", () => {
  it("publishes a schema version", () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });

  it("creates an empty scene document with all top-level collections", () => {
    const scene = createEmptySceneDocument();

    expect(scene.schemaVersion).toBe(1);
    expect(scene.entities).toEqual([]);
    expect(scene.constraints).toEqual([]);
    expect(scene.forceSources).toEqual([]);
    expect(scene.analyzers).toEqual([]);
    expect(scene.annotations).toEqual([]);
  });

  it("accepts convex polygons and rejects concave polygons in v1", () => {
    expect(() =>
      createUserPolygonEntity({
        id: "poly-convex",
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      createUserPolygonEntity({
        id: "poly-concave",
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ],
      }),
    ).toThrow(/convex/i);
  });

  it("creates a runtime frame payload with stable entity ids and transforms", () => {
    const frame = createRuntimeFramePayload({
      frameNumber: 3,
      entities: [
        {
          entityId: "ball-1",
          position: { x: 1, y: 2 },
          rotation: 0,
        },
      ],
    });

    expect(frame.frameNumber).toBe(3);
    expect(frame.entities[0]).toMatchObject({
      entityId: "ball-1",
      position: { x: 1, y: 2 },
      rotation: 0,
    });
  });

  it("marks structural and physical edits as requiring a runtime rebuild", () => {
    expect(requiresRuntimeRebuild(["analysis", "annotation"])).toBe(false);
    expect(requiresRuntimeRebuild(["analysis", "physics"])).toBe(true);
  });
});
