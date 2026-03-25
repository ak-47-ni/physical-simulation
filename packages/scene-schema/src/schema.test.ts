import { describe, expect, it } from "vitest";

import {
  SCENE_SCHEMA_VERSION,
  createEmptySceneDocument,
  createRuntimeCompileRequest,
  createTrajectoryAnalyzer,
  createRuntimeFramePayload,
  createUserPolygonEntity,
  cloneSceneDocument,
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

  it("creates trajectory analyzers that bind to a target entity", () => {
    expect(
      createTrajectoryAnalyzer({
        id: "traj-1",
        entityId: "ball-1",
      }),
    ).toEqual({
      id: "traj-1",
      kind: "trajectory",
      entityId: "ball-1",
    });
  });

  it("clones scene documents with richer editor entities and nested polygon points", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push(
      createUserPolygonEntity({
        id: "poly-1",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 },
        ],
      }),
      {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: 132,
        y: 176,
        radius: 24,
        mass: 1.2,
        friction: 0.14,
        restitution: 0.82,
        locked: false,
        velocityX: 12,
        velocityY: -6,
      },
      {
        id: "board-1",
        kind: "board",
        label: "Board 1",
        x: 318,
        y: 272,
        width: 120,
        height: 18,
        rotationDegrees: 12,
        mass: 5,
        friction: 0.42,
        restitution: 0.18,
        locked: true,
        velocityX: 0,
        velocityY: 0,
      },
    );
    scene.analyzers.push(
      createTrajectoryAnalyzer({
        id: "traj-1",
        entityId: "ball-1",
      }),
    );
    scene.annotations.push({
      id: "stroke-1",
      points: [
        { x: 8, y: 12 },
        { x: 24, y: 30 },
      ],
    });

    const clone = cloneSceneDocument(scene);

    expect(clone).toEqual(scene);
    expect(clone).not.toBe(scene);
    expect(clone.entities).not.toBe(scene.entities);
    expect(clone.analyzers).not.toBe(scene.analyzers);
    expect(clone.annotations).not.toBe(scene.annotations);

    const originalPolygon = scene.entities[0];
    const clonedPolygon = clone.entities[0];

    if (originalPolygon.kind !== "user-polygon" || clonedPolygon.kind !== "user-polygon") {
      throw new Error("expected user polygon entities");
    }

    expect(clonedPolygon.points).not.toBe(originalPolygon.points);
    expect(clone.annotations[0]?.points).not.toBe(scene.annotations[0]?.points);
  });

  it("preserves sized-entity rotationDegrees when cloning scene documents", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push({
      id: "board-1",
      kind: "board",
      label: "Board 1",
      x: 3.18,
      y: 2.72,
      width: 1.2,
      height: 0.18,
      rotationDegrees: 24,
    });

    const clone = cloneSceneDocument(scene);
    const clonedBoard = clone.entities[0];

    if (!clonedBoard || clonedBoard.kind !== "board") {
      throw new Error("expected board entity");
    }

    expect(clonedBoard.rotationDegrees).toBe(24);
  });

  it("creates runtime compile requests from cloned scene state and dirty scopes", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push({
      id: "ball-1",
      kind: "ball",
      label: "Ball 1",
      x: 132,
      y: 176,
      radius: 24,
      velocityX: 12,
      velocityY: -6,
    });
    scene.analyzers.push(
      createTrajectoryAnalyzer({
        id: "traj-1",
        entityId: "ball-1",
      }),
    );

    const request = createRuntimeCompileRequest(scene, ["analysis"]);

    expect(request.rebuildRequired).toBe(false);
    expect(request.dirtyScopes).toEqual(["analysis"]);
    expect(request.scene).toEqual(scene);
    expect(request.scene).not.toBe(scene);
    expect(request.scene.entities).not.toBe(scene.entities);

    const originalBall = scene.entities[0];
    const clonedBall = request.scene.entities[0];

    if (originalBall.kind !== "ball" || clonedBall.kind !== "ball") {
      throw new Error("expected ball entities");
    }

    originalBall.x = 999;
    expect(clonedBall.x).toBe(132);
  });

  it("deep-clones typed constraint and force-source payload vectors", () => {
    const scene = createEmptySceneDocument();

    scene.constraints.push(
      {
        id: "spring-1",
        kind: "spring",
        entityAId: "ball-1",
        entityBId: "board-1",
        restLength: 120,
        stiffness: 18,
      },
      {
        id: "track-1",
        kind: "track",
        entityId: "ball-1",
        origin: { x: 10, y: 20 },
        axis: { x: 1, y: 0 },
      },
    );
    scene.forceSources.push({
      id: "gravity-1",
      kind: "gravity",
      acceleration: { x: 0, y: 9.8 },
    });

    const clone = cloneSceneDocument(scene);
    const originalTrack = scene.constraints[1] as {
      origin: { x: number; y: number };
      axis: { x: number; y: number };
    };
    const clonedTrack = clone.constraints[1] as {
      origin: { x: number; y: number };
      axis: { x: number; y: number };
    };
    const originalGravity = scene.forceSources[0] as {
      acceleration: { x: number; y: number };
    };
    const clonedGravity = clone.forceSources[0] as {
      acceleration: { x: number; y: number };
    };

    originalTrack.origin.x = 999;
    originalTrack.axis.y = 42;
    originalGravity.acceleration.y = -1;

    expect(clonedTrack.origin).toEqual({ x: 10, y: 20 });
    expect(clonedTrack.axis).toEqual({ x: 1, y: 0 });
    expect(clonedGravity.acceleration).toEqual({ x: 0, y: 9.8 });
  });

  it("clones typed constraints and force sources into runtime compile requests", () => {
    const scene = createEmptySceneDocument();

    scene.constraints.push({
      id: "track-1",
      kind: "track",
      entityId: "ball-1",
      origin: { x: 4, y: 8 },
      axis: { x: 0, y: 1 },
    });
    scene.forceSources.push({
      id: "gravity-1",
      kind: "gravity",
      acceleration: { x: 0, y: 12 },
    });

    const request = createRuntimeCompileRequest(scene, ["physics"]);
    const originalTrack = scene.constraints[0] as {
      origin: { x: number; y: number };
      axis: { x: number; y: number };
    };
    const clonedTrack = request.scene.constraints[0] as {
      origin: { x: number; y: number };
      axis: { x: number; y: number };
    };
    const originalGravity = scene.forceSources[0] as {
      acceleration: { x: number; y: number };
    };
    const clonedGravity = request.scene.forceSources[0] as {
      acceleration: { x: number; y: number };
    };

    originalTrack.origin.y = -100;
    originalTrack.axis.x = -5;
    originalGravity.acceleration.x = 7;

    expect(clonedTrack.origin).toEqual({ x: 4, y: 8 });
    expect(clonedTrack.axis).toEqual({ x: 0, y: 1 });
    expect(clonedGravity.acceleration).toEqual({ x: 0, y: 12 });
  });
});
