import { describe, expect, it } from "vitest";
import { createEmptySceneDocument } from "../../../../packages/scene-schema/src";

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
  {
    center: { x: 240, y: 180 },
    endAngleDegrees: 105,
    entityId: "ball-1",
    id: "arc-track-1",
    kind: "arc-track" as const,
    label: "Arc track 1",
    radius: 90,
    side: "inside" as const,
    startAngleDegrees: -45,
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
      {
        center: { x: 240, y: 180 },
        endAngleDegrees: 105,
        entityId: "ball-1",
        id: "arc-track-1",
        kind: "arc-track",
        radius: 90,
        side: "inside",
        startAngleDegrees: -45,
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

  it("defaults missing persisted restitution to 1 while preserving explicit saved values", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push(
      {
        id: "ball-legacy",
        kind: "ball",
        label: "Legacy Ball",
        radius: 0.24,
        x: 1.32,
        y: 1.76,
      },
      {
        id: "board-explicit",
        kind: "board",
        label: "Board Explicit",
        width: 1.2,
        height: 0.18,
        x: 3.18,
        y: 2.72,
        restitution: 0.35,
      },
    );

    const restored = createEditorSceneStateFromSceneDocument({ scene });

    expect(restored.entities).toEqual([
      expect.objectContaining({
        id: "ball-legacy",
        restitution: 1,
      }),
      expect.objectContaining({
        id: "board-explicit",
        restitution: 0.35,
      }),
    ]);
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
        restitution: 1,
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
        rotationDegrees: 0,
        mass: 5000,
        friction: 0.42,
        restitution: 1,
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
      {
        center: { x: 24000, y: 18000 },
        endAngleDegrees: 105,
        entityId: "ball-1",
        id: "arc-track-1",
        kind: "arc-track",
        label: "Arc track 1",
        radius: 9000,
        side: "inside",
        startAngleDegrees: -45,
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

  it("round-trips arc-track constraints through persisted scene documents", () => {
    const scene = createSceneDocumentFromEditorState({
      constraints: TEST_CONSTRAINTS,
      entities: createInitialSceneEntities(),
    });

    expect(scene.constraints).toContainEqual({
      center: { x: 240, y: 180 },
      endAngleDegrees: 105,
      entityId: "ball-1",
      id: "arc-track-1",
      kind: "arc-track",
      radius: 90,
      side: "inside",
      startAngleDegrees: -45,
    });

    const restored = createEditorSceneStateFromSceneDocument({ scene });

    expect(restored.constraints).toContainEqual({
      center: { x: 240, y: 180 },
      endAngleDegrees: 105,
      entityId: "ball-1",
      id: "arc-track-1",
      kind: "arc-track",
      label: "Arc track 1",
      radius: 90,
      side: "inside",
      startAngleDegrees: -45,
    });
  });
});
