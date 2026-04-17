import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION,
  createDuplicatedEntity,
  createInitialSceneEntities,
  createPlacedBodyEntity,
  RIGID_BOUNDARY_LIBRARY_BODY_KINDS,
  readDefaultRigidBodyPhysics,
  readDefaultRigidBodyFriction,
  type LibraryBodyKind,
} from "./editorStore";

const ELASTIC_BODY_KINDS: LibraryBodyKind[] = ["ball", "block", "board", "polygon"];

describe("editorStore", () => {
  it("publishes rigid-boundary library body kinds for authoring", () => {
    expect(RIGID_BOUNDARY_LIBRARY_BODY_KINDS).toEqual([
      "ball",
      "block",
      "board",
      "polygon",
      "arc-track",
    ]);
  });

  it("creates support boards locked by default for classroom collision scenes", () => {
    const board = createPlacedBodyEntity([], "board", { x: 12, y: 18 });

    expect(board.locked).toBe(true);
  });

  it("creates new library bodies with fully elastic restitution defaults", () => {
    for (const kind of ELASTIC_BODY_KINDS) {
      const entity = createPlacedBodyEntity([], kind, { x: 12, y: 18 });

      expect(entity.restitution).toBe(DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION);
    }
  });

  it("publishes classroom defaults that separate board friction from elastic restitution", () => {
    expect(DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION).toBe(1);
    expect(readDefaultRigidBodyFriction("ball")).toBe(0);
    expect(readDefaultRigidBodyFriction("block")).toBe(0);
    expect(readDefaultRigidBodyFriction("board")).toBe(0.42);
    expect(readDefaultRigidBodyFriction("polygon")).toBe(0);
  });

  it("publishes per-body classroom rigid defaults that preserve ideal elastic board support scenes", () => {
    expect(readDefaultRigidBodyPhysics("ball")).toMatchObject({
      mass: 1.2,
      friction: 0,
      restitution: 1,
      locked: false,
    });
    expect(readDefaultRigidBodyPhysics("board")).toMatchObject({
      mass: 5,
      friction: 0.42,
      restitution: 1,
      locked: true,
    });
  });

  it("uses board-only non-zero default friction for new library bodies", () => {
    expect(createPlacedBodyEntity([], "ball", { x: 12, y: 18 }).friction).toBe(0);
    expect(createPlacedBodyEntity([], "block", { x: 12, y: 18 }).friction).toBe(0);
    expect(createPlacedBodyEntity([], "board", { x: 12, y: 18 }).friction).toBe(0.42);
    expect(createPlacedBodyEntity([], "polygon", { x: 12, y: 18 }).friction).toBe(0);
  });

  it("seeds the initial scene with fully elastic restitution defaults", () => {
    expect(createInitialSceneEntities().map((entity) => entity.restitution)).toEqual([1, 1]);
  });

  it("seeds the initial scene with the board-only friction policy", () => {
    expect(createInitialSceneEntities().map((entity) => entity.friction)).toEqual([0, 0.42]);
  });

  it("seeds the initial scene with a locked support board", () => {
    const board = createInitialSceneEntities().find((entity) => entity.kind === "board");

    expect(board?.locked).toBe(true);
  });

  it("creates arc-track body entities with default geometry and board-thickness semantics", () => {
    const entity = createPlacedBodyEntity([], "arc-track", { x: 12, y: 18 });

    expect(entity).toEqual({
      anchorEndpoint: "start",
      anchorEntityId: "board-1",
      anchorEntityKind: "board",
      id: "arc-track-1",
      kind: "arc-track",
      label: "Arc Track 1",
      center: { x: 12, y: 18 },
      entryEndpoint: "start",
      side: "inside",
      physicsMode: "hybrid-rail-body",
      radius: 100,
      sweepAngleDegrees: 90,
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
        anchorEntityId: "board-1",
        anchorEntityKind: "board",
        anchorEndpoint: "end",
        center: { x: 120, y: 180 },
        entryEndpoint: "end",
        side: "outside",
        physicsMode: "hybrid-rail-body",
        radius: 100,
        sweepAngleDegrees: 120,
        centralAngleDegrees: 120,
        rotationDegrees: 15,
        thickness: 18,
      },
    );

    expect(duplicated).toEqual({
      id: "arc-track-1-copy-1",
      kind: "arc-track",
      label: "Arc Track 1 Copy 1",
      anchorEntityId: "board-1",
      anchorEntityKind: "board",
      anchorEndpoint: "end",
      center: { x: 144, y: 204 },
      entryEndpoint: "end",
      side: "outside",
      physicsMode: "hybrid-rail-body",
      radius: 100,
      sweepAngleDegrees: 120,
      centralAngleDegrees: 120,
      rotationDegrees: 15,
      thickness: 18,
    });
  });
});
