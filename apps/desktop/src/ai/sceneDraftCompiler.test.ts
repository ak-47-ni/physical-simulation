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

  it("converts an instantaneous energy release into opposite initial velocities without a spring", () => {
    const draft = validateSceneDraft({
      title: "压缩微型弹簧瞬间释放",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "水平地面", friction: 0.2, locked: true },
        { kind: "block", name: "A", mass: 1, restitution: 1 },
        { kind: "block", name: "B", mass: 4, restitution: 1 },
      ],
      relationships: [
        { kind: "place-on", entity: "A", target: "水平地面", position: "center" },
        { kind: "place-on", entity: "B", target: "水平地面", position: "left" },
        {
          direction: { x: 1, y: 0 },
          entityA: "A",
          entityB: "B",
          kind: "energy-release",
          totalKineticEnergy: 10,
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
      settings: createSceneAuthoringSettings({
        lengthUnit: "m",
        pixelsPerMeter: 100,
      }),
    });
    const blockA = result.entities.find((entity) => entity.label === "A");
    const blockB = result.entities.find((entity) => entity.label === "B");

    expect(blockA).toMatchObject({
      velocityX: 4,
      velocityY: 0,
    });
    expect(blockB).toMatchObject({
      velocityX: -1,
      velocityY: 0,
    });
    expect(result.constraints.some((constraint) => constraint.kind === "spring")).toBe(false);
  });

  it("compiles connected incline arc horizontal track scenes with a fixed spring anchor", () => {
    const settings = createSceneAuthoringSettings({
      lengthUnit: "m",
      pixelsPerMeter: 100,
    });
    const draft = validateSceneDraft({
      title: "粗糙斜面接光滑圆弧和弹簧",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "board",
          name: "粗糙斜面",
          length: 4,
          height: 0.14,
          friction: 0.25,
          angleDegrees: 37,
          locked: true,
        },
        {
          kind: "arc-track",
          name: "光滑圆弧",
          radius: 0.5,
          sweepAngleDegrees: 37,
          angleDegrees: 18.5,
          friction: 0,
          anchorEntity: "粗糙斜面",
          anchorEndpoint: "end",
          entryEndpoint: "start",
        },
        {
          kind: "board",
          name: "水平光滑轨道",
          length: 5,
          height: 0.14,
          friction: 0,
          angleDegrees: 0,
          locked: true,
        },
        {
          kind: "ball",
          name: "小球",
          mass: 1,
          radius: 0.24,
          initialVelocity: { x: 0, y: 0 },
          restitution: 1,
        },
        {
          kind: "block",
          name: "木块",
          mass: 2,
          width: 0.84,
          height: 0.52,
          friction: 0,
          restitution: 1,
        },
        {
          kind: "block",
          name: "弹簧固定端",
          mass: 5,
          width: 0.16,
          height: 0.52,
          friction: 0,
          locked: true,
        },
      ],
      relationships: [
        {
          kind: "place-on",
          entity: "小球",
          target: "粗糙斜面",
          position: "left",
        },
        {
          kind: "connect-endpoints",
          source: "粗糙斜面",
          sourceEndpoint: "end",
          target: "光滑圆弧",
          targetEndpoint: "start",
        },
        {
          kind: "connect-endpoints",
          source: "光滑圆弧",
          sourceEndpoint: "end",
          target: "水平光滑轨道",
          targetEndpoint: "start",
        },
        {
          kind: "place-on",
          entity: "木块",
          target: "水平光滑轨道",
          position: "right",
        },
        {
          kind: "place-on",
          entity: "弹簧固定端",
          target: "水平光滑轨道",
          position: "right",
        },
        {
          kind: "spring-between",
          entityA: "弹簧固定端",
          entityB: "木块",
          restLength: 0.2,
          stiffness: 100,
        },
      ],
      analyzers: [{ kind: "trajectory", entity: "小球" }],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    const result = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings,
    });
    const slope = result.entities.find((entity) => entity.label === "粗糙斜面");
    const arc = result.entities.find((entity) => entity.kind === "arc-track");
    const horizontal = result.entities.find((entity) => entity.label === "水平光滑轨道");
    const ball = result.entities.find((entity) => entity.label === "小球");

    expect(result.gravity).toBe(10);
    expect(slope).toMatchObject({
      friction: 0.25,
      rotationDegrees: 37,
      width: 4,
    });
    expect(arc).toMatchObject({
      autoGenerated: true,
      anchorEntityId: "ai-board-1",
      anchorEndpoint: "end",
      entryEndpoint: "start",
      kind: "arc-track",
      managedConnection: expect.objectContaining({
        sourceEntityId: "ai-board-1",
        targetEntityId: "ai-board-2",
      }),
      physicsMode: "hybrid-rail-body",
    });
    expect(arc && "radius" in arc ? arc.radius : 0).toBeGreaterThan(0);
    expect(horizontal).toMatchObject({
      friction: 0,
      rotationDegrees: 0,
    });
    expect(ball).toMatchObject({
      mass: 1,
      velocityX: 0,
      velocityY: 0,
    });
    expect(result.constraints).toContainEqual(
      expect.objectContaining({
        entityAId: "ai-block-2",
        entityBId: "ai-block-3",
        kind: "spring",
        restLength: 0.5,
        stiffness: 100,
      }),
    );
    expect(result.entities).toContainEqual(
      expect.objectContaining({
        id: "ai-block-3",
        kind: "block",
        label: "弹簧接触端",
        locked: false,
        mass: 0.05,
      }),
    );
    expect(result.visibleTrajectoryEntityIds.has("ai-ball-1")).toBe(true);
  });

  it("uses the managed board-to-board smooth arc for AI board arc board chains", () => {
    const settings = createSceneAuthoringSettings({
      lengthUnit: "m",
      pixelsPerMeter: 100,
    });
    const draft = validateSceneDraft({
      title: "斜面底端平滑衔接圆弧再连接水平轨道",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "board",
          name: "斜面",
          length: 4,
          friction: 0.25,
          angleDegrees: 37,
          locked: true,
        },
        {
          kind: "arc-track",
          name: "AI给出的圆弧",
          radius: 0.5,
          sweepAngleDegrees: 180,
          angleDegrees: 0,
        },
        {
          kind: "board",
          name: "水平轨道",
          length: 5,
          friction: 0,
          angleDegrees: 0,
          locked: true,
        },
      ],
      relationships: [
        {
          kind: "connect-endpoints",
          source: "斜面",
          sourceEndpoint: "end",
          target: "AI给出的圆弧",
          targetEndpoint: "start",
        },
        {
          kind: "connect-endpoints",
          source: "AI给出的圆弧",
          sourceEndpoint: "end",
          target: "水平轨道",
          targetEndpoint: "start",
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
      settings,
    });
    const explicitAiArc = result.entities.find((entity) => entity.id === "ai-arc-track-1");
    const managedArc = result.entities.find(
      (entity) => entity.kind === "arc-track" && entity.id.startsWith("smooth-arc-"),
    );

    expect(explicitAiArc).toBeUndefined();
    expect(managedArc).toMatchObject({
      autoGenerated: true,
      anchorEntityId: "ai-board-1",
      anchorEndpoint: "end",
      kind: "arc-track",
      managedConnection: expect.objectContaining({
        sourceEntityId: "ai-board-1",
        targetEntityId: "ai-board-2",
      }),
      physicsMode: "hybrid-rail-body",
    });
  });

  it("infers a spring constraint from a fixed spring anchor when the draft omitted spring-between", () => {
    const draft = validateSceneDraft({
      title: "水平轨道右端固定一轻质水平弹簧，劲度系数 k=100N/m，间距 x0=0.2m",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "水平轨道", length: 5, friction: 0, locked: true },
        { kind: "block", name: "木块", mass: 2, friction: 0 },
        {
          kind: "block",
          name: "弹簧固定端",
          width: 0.16,
          height: 0.52,
          locked: true,
        },
      ],
      relationships: [
        { kind: "place-on", entity: "木块", target: "水平轨道", position: "right" },
        { kind: "place-on", entity: "弹簧固定端", target: "水平轨道", position: "right" },
      ],
      assumptions: ["弹簧自由端与木块相距 x0=0.2m。"],
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

    expect(result.constraints).toContainEqual(
      expect.objectContaining({
        entityAId: "ai-block-2",
        entityBId: "ai-block-3",
        kind: "spring",
        restLength: 0.5,
        stiffness: 100,
      }),
    );
    expect(result.entities).toContainEqual(
      expect.objectContaining({
        id: "ai-block-3",
        kind: "block",
        label: "弹簧接触端",
        locked: false,
        mass: 0.05,
      }),
    );
    const contactEnd = result.entities.find((entity) => entity.id === "ai-block-3");
    const target = result.entities.find((entity) => entity.label === "木块");

    if (!contactEnd || contactEnd.kind !== "block" || !target || target.kind !== "block") {
      throw new Error("expected generated contact spring end and target block");
    }

    expect(contactEnd.x - (target.x + target.width)).toBeCloseTo(0.2, 6);
  });

  it("compiles contact-spring-end as a dedicated contact cap instead of directly springing the target", () => {
    const draft = validateSceneDraft({
      title: "水平轨道右端固定轻弹簧，木块距离自由端 0.2m",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "水平轨道", length: 5, friction: 0, locked: true },
        { kind: "block", name: "木块", mass: 2, width: 0.84, height: 0.52, friction: 0 },
        { kind: "block", name: "弹簧固定端", width: 0.16, height: 0.52, locked: true },
      ],
      relationships: [
        { kind: "place-on", entity: "木块", target: "水平轨道", position: "right" },
        { kind: "place-on", entity: "弹簧固定端", target: "水平轨道", position: "right" },
        {
          anchor: "弹簧固定端",
          gap: 0.2,
          kind: "contact-spring-end",
          restLength: 0.6,
          stiffness: 100,
          target: "木块",
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
      settings: createSceneAuthoringSettings({
        lengthUnit: "m",
        pixelsPerMeter: 100,
      }),
    });
    const anchor = result.entities.find((entity) => entity.label === "弹簧固定端");
    const target = result.entities.find((entity) => entity.label === "木块");
    const contactEnd = result.entities.find((entity) => entity.label === "弹簧接触端");

    expect(target).toMatchObject({
      kind: "block",
      locked: false,
      mass: 2,
    });
    expect(contactEnd).toMatchObject({
      kind: "block",
      locked: false,
      mass: 0.05,
      width: 0.08,
    });
    expect(result.constraints).toContainEqual(
      expect.objectContaining({
        entityAId: anchor?.id,
        entityBId: contactEnd?.id,
        kind: "spring",
        restLength: 0.6,
        stiffness: 100,
      }),
    );
    expect(
      result.constraints.some(
        (constraint) =>
          constraint.kind === "spring" &&
          ((constraint.entityAId === anchor?.id && constraint.entityBId === target?.id) ||
            (constraint.entityAId === target?.id && constraint.entityBId === anchor?.id)),
      ),
    ).toBe(false);

    if (!contactEnd || contactEnd.kind !== "block" || !target || target.kind !== "block") {
      throw new Error("expected generated contact spring end and target block");
    }

    expect(contactEnd.x - (target.x + target.width)).toBeCloseTo(0.2, 6);
  });

  it("treats legacy fixed-end springs with an x0 gap hint as contact springs even when the anchor name is generic", () => {
    const draft = validateSceneDraft({
      title: "水平轨道右端固定一轻质水平弹簧，劲度系数 k=100N/m",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "水平轨道", length: 5, friction: 0, locked: true },
        { kind: "block", name: "固定挡板", mass: 5, width: 0.16, height: 0.52, locked: true },
        { kind: "block", name: "木块", mass: 2, width: 0.84, height: 0.52, friction: 0 },
      ],
      relationships: [
        { kind: "place-on", entity: "固定挡板", target: "水平轨道", position: "right" },
        { kind: "place-on", entity: "木块", target: "水平轨道", position: "right" },
        {
          kind: "spring-between",
          entityA: "固定挡板",
          entityB: "木块",
          restLength: 0.2,
          stiffness: undefined,
        },
      ],
      assumptions: ["弹簧自由端与木块相距 x0=0.2m。"],
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
    const anchor = result.entities.find((entity) => entity.label === "固定挡板");
    const target = result.entities.find((entity) => entity.label === "木块");
    const contactEnd = result.entities.find((entity) => entity.label === "弹簧接触端");

    expect(result.constraints).toContainEqual(
      expect.objectContaining({
        entityAId: anchor?.id,
        entityBId: contactEnd?.id,
        kind: "spring",
        restLength: 0.5,
        stiffness: 100,
      }),
    );
    expect(
      result.constraints.some(
        (constraint) =>
          constraint.kind === "spring" &&
          ((constraint.entityAId === anchor?.id && constraint.entityBId === target?.id) ||
            (constraint.entityAId === target?.id && constraint.entityBId === anchor?.id)),
      ),
    ).toBe(false);

    if (!contactEnd || contactEnd.kind !== "block" || !target || target.kind !== "block") {
      throw new Error("expected generated contact spring end and target block");
    }

    expect(contactEnd.x - (target.x + target.width)).toBeCloseTo(0.2, 6);
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
