import { describe, expect, it } from "vitest";

import { createSceneAuthoringSettings } from "./sceneAuthoringSettings";
import { createInitialSceneEntities } from "./editorStore";
import {
  createRuntimeCompileRequest,
  createRuntimeCompileRequestFromEditorState,
} from "./runtimeCompileRequest";

describe("runtimeCompileRequest", () => {
  it("maps editor entities and annotation strokes into a richer runtime compile payload", () => {
    const entities = createInitialSceneEntities().map((entity, index) =>
      index === 0
        ? { ...entity, velocityX: 6, velocityY: 4 }
        : { ...entity, rotationDegrees: 30 },
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
            restitution: 1,
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
            restitution: 1,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ],
      },
    });
    expect(request.scene.annotations[0]?.points).not.toBe(annotations[0]?.points);
    const compiledBoard = request.scene.entities[1];

    if (!compiledBoard || compiledBoard.kind !== "board") {
      throw new Error("expected board runtime entity");
    }

    expect(compiledBoard.rotationRadians).toBeCloseTo(Math.PI / 6);
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

  it("normalizes authored unit-aware values back to SI in the runtime compile payload", () => {
    const entities = createInitialSceneEntities().map((entity, index) =>
      index === 0
        ? {
            ...entity,
            x: 132,
            y: 176,
            radius: 24,
            mass: 1200,
            velocityX: 125,
            velocityY: 50,
          }
        : {
            ...entity,
            x: 318,
            y: 272,
            width: 120,
            height: 18,
            mass: 5000,
          },
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

    const request = createRuntimeCompileRequestFromEditorState({
      constraints,
      dirtyScopes: ["physics"],
      entities,
      settings: createSceneAuthoringSettings({
        gravity: 980,
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
        pixelsPerMeter: 1,
      }),
    });

    expect(request.rebuildRequired).toBe(true);
    expect(request.scene).toMatchObject({
      forceSources: [
        {
          acceleration: { x: 0, y: 9.8 },
          id: "gravity-primary",
          kind: "gravity",
        },
      ],
      constraints: [
        {
          entityAId: "ball-1",
          entityBId: "board-1",
          id: "spring-1",
          kind: "spring",
          restLength: 2.36,
          stiffness: 24,
        },
        {
          axis: { x: 1.8, y: 0.6 },
          entityId: "ball-1",
          id: "track-1",
          kind: "track",
          origin: { x: 1.56, y: 2 },
        },
      ],
      entities: [
        {
          id: "ball-1",
          kind: "ball",
          x: 1.32,
          y: 1.76,
          radius: 0.24,
          mass: 1.2,
          velocityX: 1.25,
          velocityY: -0.5,
        },
        {
          id: "board-1",
          kind: "board",
          x: 3.18,
          y: 2.72,
          width: 1.2,
          height: 0.18,
          mass: 5,
        },
      ],
    });
    expect(request.scene).not.toHaveProperty("pixelsPerMeter");
  });

  it("preserves arc-track payload fields when building a runtime compile request", () => {
    const request = createRuntimeCompileRequestFromEditorState({
      constraints: [
        {
          center: { x: 1.56, y: 2 },
          endAngleDegrees: 150,
          entryEndpoint: "start",
          id: "arc-track-1",
          kind: "arc-track" as const,
          label: "Arc track 1",
          radius: 1.2,
          side: "inside" as const,
          startAngleDegrees: 30,
        },
      ],
      entities: createInitialSceneEntities(),
    });

    expect(request.scene.constraints).toEqual([
      {
        center: { x: 1.56, y: 2 },
        endAngleDegrees: 150,
        entryEndpoint: "start",
        id: "arc-track-1",
        kind: "arc-track",
        radius: 1.2,
        side: "inside",
        startAngleDegrees: 30,
      },
    ]);
  });

  it("normalizes arc-track center and radius to SI when authored units are non-SI", () => {
    const request = createRuntimeCompileRequestFromEditorState({
      constraints: [
        {
          center: { x: 156, y: 200 },
          endAngleDegrees: 150,
          entryEndpoint: "start",
          id: "arc-track-1",
          kind: "arc-track" as const,
          label: "Arc track 1",
          radius: 120,
          side: "inside" as const,
          startAngleDegrees: 30,
        },
      ],
      entities: createInitialSceneEntities(),
      settings: createSceneAuthoringSettings({
        gravity: 980,
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
        pixelsPerMeter: 1,
      }),
    });

    expect(request.scene.constraints).toEqual([
      {
        center: { x: 1.56, y: 2 },
        endAngleDegrees: 150,
        entryEndpoint: "start",
        id: "arc-track-1",
        kind: "arc-track",
        radius: 1.2,
        side: "inside",
        startAngleDegrees: 30,
      },
    ]);
  });

  it("keeps compile-request cloning stable when the source scene mutates later", () => {
    const request = createRuntimeCompileRequestFromEditorState({
      entities: createInitialSceneEntities(),
    });
    const clonedRequest = createRuntimeCompileRequest(request.scene, ["analysis"]);
    const mutableEntity = request.scene.entities[0];
    const mutableForceSource = request.scene.forceSources[0];

    if (!mutableEntity || mutableEntity.kind !== "ball") {
      throw new Error("expected ball runtime entity");
    }

    if (!mutableForceSource || mutableForceSource.kind !== "gravity") {
      throw new Error("expected gravity force source");
    }

    mutableEntity.x = 999;
    mutableEntity.y = 999;
    mutableForceSource.acceleration = { x: 1, y: 1 };

    expect(clonedRequest.scene.entities[0]).toMatchObject({
      x: 132,
      y: 176,
    });
    expect(clonedRequest.scene.forceSources[0]).toMatchObject({
      acceleration: { x: 0, y: 9.8 },
    });
    expect(clonedRequest.scene).not.toHaveProperty("pixelsPerMeter");
  });
});
