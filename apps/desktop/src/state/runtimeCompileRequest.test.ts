import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createUserPolygonEntity,
} from "../../../../packages/scene-schema/src";

import { createRuntimeCompileRequest } from "./runtimeCompileRequest";

describe("runtimeCompileRequest", () => {
  it("clones scene data and rebuild metadata into a runtime compile request", () => {
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

    const request = createRuntimeCompileRequest(scene, ["analysis"]);

    expect(request).toMatchObject({
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
      scene,
    });
    expect(request.scene).not.toBe(scene);
    expect(request.scene.entities[0]).toEqual(scene.entities[0]);
    expect(request.scene.entities[0]?.points).not.toBe(scene.entities[0]?.points);
  });
});
