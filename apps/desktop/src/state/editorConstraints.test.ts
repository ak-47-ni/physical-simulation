import { describe, expect, it } from "vitest";

import { createDuplicatedEntity, createInitialSceneEntities } from "./editorStore";
import {
  createDefaultEditorConstraint,
  createSpringConstraintFromEntities,
} from "./editorConstraints";

describe("editorConstraints", () => {
  it("creates default spring constraints with deterministic ids and labels", () => {
    const spring = createDefaultEditorConstraint([], "spring");
    const nextSpring = createDefaultEditorConstraint([spring], "spring");

    expect(spring).toEqual({
      id: "spring-1",
      kind: "spring",
      label: "Spring 1",
      entityAId: null,
      entityBId: null,
      restLength: 120,
      stiffness: 24,
    });
    expect(nextSpring).toMatchObject({
      id: "spring-2",
      label: "Spring 2",
    });
  });

  it("creates default track constraints with deterministic ids and labels", () => {
    const track = createDefaultEditorConstraint([], "track");
    const nextTrack = createDefaultEditorConstraint([track], "track");

    expect(track).toEqual({
      id: "track-1",
      kind: "track",
      label: "Track 1",
      entityId: null,
      origin: { x: 0, y: 0 },
      axis: { x: 1, y: 0 },
    });
    expect(nextTrack).toMatchObject({
      id: "track-2",
      label: "Track 2",
    });
  });

  it("does not duplicate attached constraints implicitly when an entity is duplicated", () => {
    const entities = createInitialSceneEntities();
    const duplicated = createDuplicatedEntity(entities, entities[0]!);
    const spring = {
      ...createDefaultEditorConstraint([], "spring"),
      entityAId: entities[0]!.id,
      entityBId: entities[1]!.id,
    };

    expect(duplicated.id).toBe("ball-2");
    expect(spring).toMatchObject({
      id: "spring-1",
      entityAId: "ball-1",
      entityBId: "board-1",
    });
  });

  it("preserves decimal rest length precision for authoring units", () => {
    const spring = createSpringConstraintFromEntities([], [
      { id: "ball-1", x: 1.56, y: 2 },
      { id: "board-1", x: 3.78, y: 2.81 },
    ]);

    expect(spring.restLength).toBe(2.36);
  });
});
