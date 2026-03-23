import { describe, expect, it } from "vitest";

import {
  createDefaultSceneAuthoringSettings,
  createSceneAuthoringSettings,
} from "./sceneAuthoringSettings";
import { createInitialSceneEntities } from "./editorStore";
import {
  convertSceneAuthoringUnits,
  createEditorSceneStateFromSceneDocument,
  createSceneDocumentFromEditorState,
} from "./editorSceneDocument";

const TEST_CONSTRAINTS = [
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

describe("editorSceneDocument", () => {
  it("creates a scene document with typed constraints and an explicit gravity source", () => {
    const scene = createSceneDocumentFromEditorState({
      analyzerId: "traj-primary",
      constraints: TEST_CONSTRAINTS,
      entities: createInitialSceneEntities(),
    });

    expect(scene.constraints).toEqual([
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
    ]);
    expect(scene.forceSources).toEqual([
      {
        acceleration: { x: 0, y: 9.8 },
        id: "gravity-primary",
        kind: "gravity",
      },
    ]);
    expect(scene.analyzers).toEqual([
      {
        entityId: "ball-1",
        id: "traj-primary",
        kind: "trajectory",
      },
    ]);
  });

  it("restores editor entities, constraints, and selected ids from a scene document", () => {
    const entities = createInitialSceneEntities();
    const scene = createSceneDocumentFromEditorState({
      constraints: TEST_CONSTRAINTS,
      entities,
    });

    const restored = createEditorSceneStateFromSceneDocument({
      scene,
      selectedConstraintId: "track-1",
      selectedEntityId: "board-1",
    });

    expect(restored.entities).toEqual(entities);
    expect(restored.constraints).toEqual(TEST_CONSTRAINTS);
    expect(restored.selectedEntityId).toBe("board-1");
    expect(restored.selectedConstraintId).toBe("track-1");
  });

  it("converts stored authored values when scene units change", () => {
    const entities = createInitialSceneEntities().map((entity, index) =>
      index === 0
        ? {
            ...entity,
            velocityX: 1.25,
            velocityY: -0.5,
          }
        : entity,
    );

    const converted = convertSceneAuthoringUnits({
      constraints: TEST_CONSTRAINTS,
      entities,
      settings: createDefaultSceneAuthoringSettings(),
      units: {
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
      },
    });

    expect(converted.settings).toEqual(
      createSceneAuthoringSettings({
        gravity: 980,
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
        pixelsPerMeter: 1,
      }),
    );
    expect(converted.entities).toEqual([
      {
        id: "ball-1",
        kind: "ball",
        label: "Ball 1",
        x: 13200,
        y: 17600,
        radius: 2400,
        mass: 1200,
        friction: 0.14,
        restitution: 0.82,
        locked: false,
        velocityX: 125,
        velocityY: -50,
      },
      {
        id: "board-1",
        kind: "board",
        label: "Board 1",
        x: 31800,
        y: 27200,
        width: 12000,
        height: 1800,
        mass: 5000,
        friction: 0.42,
        restitution: 0.18,
        locked: false,
        velocityX: 0,
        velocityY: 0,
      },
    ]);
    expect(converted.constraints).toEqual([
      {
        entityAId: "ball-1",
        entityBId: "board-1",
        id: "spring-1",
        kind: "spring",
        label: "Spring 1",
        restLength: 23600,
        stiffness: 24,
      },
      {
        axis: { x: 18000, y: 6000 },
        entityId: "ball-1",
        id: "track-1",
        kind: "track",
        label: "Track 1",
        origin: { x: 15600, y: 20000 },
      },
    ]);
  });

  it("preserves semantic size and motion when unit conversions round-trip back to SI", () => {
    const entities = createInitialSceneEntities().map((entity, index) =>
      index === 0
        ? {
            ...entity,
            velocityX: 1.25,
            velocityY: -0.5,
          }
        : entity,
    );

    const converted = convertSceneAuthoringUnits({
      constraints: TEST_CONSTRAINTS,
      entities,
      settings: createDefaultSceneAuthoringSettings(),
      units: {
        lengthUnit: "cm",
        velocityUnit: "cm/s",
        massUnit: "g",
      },
    });
    const roundTrip = convertSceneAuthoringUnits({
      constraints: converted.constraints,
      entities: converted.entities,
      settings: converted.settings,
      units: {
        lengthUnit: "m",
        velocityUnit: "m/s",
        massUnit: "kg",
      },
    });

    expect(roundTrip.settings).toEqual(createDefaultSceneAuthoringSettings());
    expect(roundTrip.entities).toEqual(entities);
    expect(roundTrip.constraints).toEqual(TEST_CONSTRAINTS);
  });
});
