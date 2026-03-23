import { describe, expect, it } from "vitest";

import { createInitialSceneEntities } from "./editorStore";
import { createRuntimeCompileRequestFromEditorState } from "./runtimeCompileRequest";

describe("runtimeCompileRequest", () => {
  it("maps editor entities and annotation strokes into a richer runtime compile payload", () => {
    const entities = createInitialSceneEntities().map((entity, index) =>
      index === 0 ? { ...entity, velocityX: 6, velocityY: -4 } : entity,
    );
    const constraints = [
      {
        entityAId: "ball-1",
        entityBId: "board-1",
        id: "spring-1",
        kind: "spring" as const,
        label: "Spring 1",
        restLength: 236,
        stiffness: 24,
      },
      {
        axis: { x: 180, y: 60 },
        entityId: "ball-1",
        id: "track-1",
        kind: "track" as const,
        label: "Track 1",
        origin: { x: 156, y: 200 },
      },
    ];
    const annotations = [
      {
        id: "stroke-1",
        color: "#111827",
        points: [
          { x: 12, y: 18 },
          { x: 36, y: 42 },
        ],
      },
    ];

    const request = createRuntimeCompileRequestFromEditorState({
      analyzerId: "traj-primary",
      annotations,
      constraints,
      dirtyScopes: ["physics", "annotation"],
      entities,
    });

    expect(request).toMatchObject({
      dirtyScopes: ["physics", "annotation"],
      rebuildRequired: true,
      scene: {
        schemaVersion: 1,
        analyzers: [
          {
            id: "traj-primary",
            kind: "trajectory",
            entityId: "ball-1",
          },
        ],
        constraints: [
          {
            entityAId: "ball-1",
            entityBId: "board-1",
            id: "spring-1",
            kind: "spring",
            restLength: 236,
            stiffness: 24,
          },
          {
            axis: { x: 180, y: 60 },
            entityId: "ball-1",
            id: "track-1",
            kind: "track",
            origin: { x: 156, y: 200 },
          },
        ],
        forceSources: [
          {
            acceleration: { x: 0, y: 9.8 },
            id: "gravity-primary",
            kind: "gravity",
          },
        ],
        annotations: [
          {
            id: "stroke-1",
            points: [
              { x: 12, y: 18 },
              { x: 36, y: 42 },
            ],
          },
        ],
        entities: [
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
            velocityX: 6,
            velocityY: -4,
          },
          {
            id: "board-1",
            kind: "board",
            label: "Board 1",
            x: 318,
            y: 272,
            width: 120,
            height: 18,
            mass: 5,
            friction: 0.42,
            restitution: 0.18,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ],
      },
    });
    expect(request.scene.annotations[0]?.points).not.toBe(annotations[0]?.points);
  });

  it("respects an explicit analyzer target and omits analyzers when no entity matches", () => {
    const entities = createInitialSceneEntities();

    const targetedRequest = createRuntimeCompileRequestFromEditorState({
      analyzerEntityId: "board-1",
      analyzerId: "traj-board",
      entities,
    });
    const emptyRequest = createRuntimeCompileRequestFromEditorState({
      analyzerEntityId: "missing-entity",
      analyzerId: "traj-missing",
      entities: [],
    });

    expect(targetedRequest.scene.analyzers).toEqual([
      {
        id: "traj-board",
        kind: "trajectory",
        entityId: "board-1",
      },
    ]);
    expect(emptyRequest.scene.analyzers).toEqual([]);
  });
});
