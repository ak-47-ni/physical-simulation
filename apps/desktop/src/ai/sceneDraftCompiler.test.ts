import { describe, expect, it } from "vitest";

import { createSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import type { EditorSceneEntity } from "../state/editorStore";
import { createRuntimeCompileRequestFromEditorState } from "../state/runtimeCompileRequest";
import { validateSceneDraft } from "./sceneDraft";
import { compileSceneDraft } from "./sceneDraftCompiler";

describe("compileSceneDraft", () => {
  it("creates a locked board and a block placed on it with velocity", () => {
    const draft = validateSceneDraft({
      title: "粗糙水平面上滑块减速",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "木板", length: 5, friction: 0.42, locked: true },
        { kind: "block", name: "滑块", mass: 1, initialVelocity: { x: 3, y: 0 } },
      ],
      relationships: [{ kind: "place-on", entity: "滑块", target: "木板", position: "left" }],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings: createSceneAuthoringSettings({ pixelsPerMeter: 100 }),
    });

    const board = result.entities.find((entity) => entity.kind === "board");
    const block = result.entities.find((entity) => entity.kind === "block");

    expect(board).toMatchObject({
      friction: 0.42,
      label: "木板",
      locked: true,
      width: 5,
    });
    expect(block).toMatchObject({
      label: "滑块",
      mass: 1,
      velocityX: 3,
      velocityY: 0,
    });
    expect(block?.y).toBeLessThan(board?.y ?? 0);
    expect(result.gravity).toBe(10);
  });

  it("emits authoring-unit dimensions rather than screen pixel dimensions", () => {
    const draft = validateSceneDraft({
      title: "米制场景",
      locale: "zh-CN",
      domain: "mechanics",
      entities: [
        { kind: "board", name: "木板", length: 5 },
        { kind: "block", name: "物块", width: 0.8, height: 0.4 },
      ],
      relationships: [{ kind: "place-on", entity: "物块", target: "木板", position: "left" }],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings: createSceneAuthoringSettings({
        lengthUnit: "m",
        pixelsPerMeter: 100,
      }),
    });
    const board = result.entities.find((entity) => entity.kind === "board");
    const block = result.entities.find((entity) => entity.kind === "block");

    expect(board).toMatchObject({
      height: 0.14,
      width: 5,
      x: 2.2,
      y: 2.6,
    });
    expect(block).toMatchObject({
      height: 0.4,
      width: 0.8,
    });
    expect(block?.x).toBeCloseTo(2.4);
    expect(block?.y).toBeCloseTo(2.2);
  });

  it("emits top-left coordinates that keep place-on blocks on the board surface", () => {
    const settings = createSceneAuthoringSettings({
      lengthUnit: "m",
      pixelsPerMeter: 100,
    });
    const draft = validateSceneDraft({
      title: "粗糙水平面上滑块减速",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "木板", length: 5, height: 0.14, locked: true },
        { kind: "block", name: "物块", width: 0.8, height: 0.4, initialVelocity: { x: 3, y: 0 } },
      ],
      relationships: [{ kind: "place-on", entity: "物块", target: "木板", position: "left" }],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const compiled = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings,
    });
    const request = createRuntimeCompileRequestFromEditorState({
      constraints: compiled.constraints,
      entities: compiled.entities,
      settings,
    });
    const board = request.scene.entities.find((entity) => entity.id === "ai-board-1");
    const block = request.scene.entities.find((entity) => entity.id === "ai-block-1");

    if (!board || board.kind !== "board" || !block || block.kind !== "block") {
      throw new Error("expected generated board and block entities");
    }

    expect(block.x).toBeGreaterThanOrEqual(board.x);
    expect(block.x - board.x).toBeCloseTo(0.2, 6);
    expect(block.x + block.width).toBeLessThanOrEqual(board.x + board.width);
    expect(block.y + block.height).toBeCloseTo(board.y, 6);
  });

  it("defaults gravity to the current scene setting when omitted", () => {
    const draft = validateSceneDraft({
      title: "默认重力",
      locale: "zh-CN",
      domain: "mechanics",
      entities: [{ kind: "ball", name: "小球" }],
      relationships: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings: createSceneAuthoringSettings({ gravity: 9.8 }),
    });

    expect(result.gravity).toBe(9.8);
  });

  it("creates spring constraints between two named bodies", () => {
    const draft = validateSceneDraft({
      title: "弹簧连接两球",
      locale: "zh-CN",
      domain: "mechanics",
      entities: [
        { kind: "ball", name: "小球A", mass: 1 },
        { kind: "ball", name: "小球B", mass: 1 },
      ],
      relationships: [
        {
          kind: "spring-between",
          entityA: "小球A",
          entityB: "小球B",
          restLength: 1.2,
          stiffness: 20,
        },
      ],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings: createSceneAuthoringSettings({ pixelsPerMeter: 100 }),
    });

    expect(result.constraints).toEqual([
      expect.objectContaining({
        entityAId: "ai-ball-1",
        entityBId: "ai-ball-2",
        kind: "spring",
        restLength: 1.2,
        stiffness: 20,
      }),
    ]);
  });

  it("inserts generated entities after existing entities without id collisions", () => {
    const existingEntities: EditorSceneEntity[] = [
      {
        friction: 0,
        id: "ai-ball-1",
        kind: "ball",
        label: "Existing",
        locked: false,
        mass: 1,
        radius: 24,
        restitution: 1,
        velocityX: 0,
        velocityY: 0,
        x: 100,
        y: 100,
      },
    ];
    const draft = validateSceneDraft({
      title: "插入小球",
      locale: "zh-CN",
      domain: "mechanics",
      entities: [{ kind: "ball", name: "新小球" }],
      relationships: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities,
      mode: "insert",
      settings: createSceneAuthoringSettings({ pixelsPerMeter: 100 }),
    });

    expect(result.entities.map((entity) => entity.id)).toEqual([
      "ai-ball-1",
      "ai-ball-2",
    ]);
  });
});
