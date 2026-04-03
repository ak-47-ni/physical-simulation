import { describe, expect, it } from "vitest";

import {
  createDuplicatedEntity,
  createInitialSceneEntities,
  createPlacedBodyEntity,
  type LibraryBodyKind,
} from "./editorStore";

const ELASTIC_BODY_KINDS: LibraryBodyKind[] = ["ball", "block", "board", "polygon"];

describe("editorStore", () => {
  it("creates new library bodies with fully elastic restitution defaults", () => {
    for (const kind of ELASTIC_BODY_KINDS) {
      const entity = createPlacedBodyEntity([], kind, { x: 12, y: 18 });

      expect(entity.restitution).toBe(1);
    }
  });

  it("seeds the initial scene with fully elastic restitution defaults", () => {
    expect(createInitialSceneEntities().map((entity) => entity.restitution)).toEqual([1, 1]);
  });

  it("creates arc-track body entities with default geometry and board-thickness semantics", () => {
    const entity = createPlacedBodyEntity([], "arc-track", { x: 12, y: 18 });

    expect(entity).toEqual({
      id: "arc-track-1",
      kind: "arc-track",
      label: "Arc Track 1",
      center: { x: 12, y: 18 },
      radius: 100,
      centralAngleDegrees: 90,
      rotationDegrees: 0,
      thickness: 18,
    });
  });

  it("duplicates arc-track body entities without changing their geometry", () => {
    const duplicated = createDuplicatedEntity(
      [],
      {
        id: "arc-track-1",
        kind: "arc-track",
        label: "Arc Track 1",
        center: { x: 120, y: 180 },
        radius: 100,
        centralAngleDegrees: 120,
        rotationDegrees: 15,
        thickness: 18,
      },
    );

    expect(duplicated).toEqual({
      id: "arc-track-1-copy-1",
      kind: "arc-track",
      label: "Arc Track 1 Copy 1",
      center: { x: 144, y: 204 },
      radius: 100,
      centralAngleDegrees: 120,
      rotationDegrees: 15,
      thickness: 18,
    });
  });
});
