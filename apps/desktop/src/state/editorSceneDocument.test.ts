import { describe, expect, it } from "vitest";

import { createInitialSceneEntities } from "./editorStore";
import {
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
});
