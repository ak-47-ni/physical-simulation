import { describe, expect, it } from "vitest";

import {
  createInitialSceneEntities,
  createPlacedBodyEntity,
  type LibraryBodyKind,
} from "./editorStore";

const BODY_KINDS: LibraryBodyKind[] = ["ball", "block", "board", "polygon"];

describe("editorStore", () => {
  it("creates new library bodies with fully elastic restitution defaults", () => {
    for (const kind of BODY_KINDS) {
      const entity = createPlacedBodyEntity([], kind, { x: 12, y: 18 });

      expect(entity.restitution).toBe(1);
    }
  });

  it("seeds the initial scene with fully elastic restitution defaults", () => {
    expect(createInitialSceneEntities().map((entity) => entity.restitution)).toEqual([1, 1]);
  });
});
