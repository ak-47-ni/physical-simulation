import { describe, expect, it } from "vitest";

import { validateSceneDraft } from "./sceneDraft";

describe("validateSceneDraft", () => {
  it("normalizes a valid rough-board block mechanics draft", () => {
    const draft = validateSceneDraft({
      title: "粗糙水平面上滑块减速",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "board",
          name: "粗糙水平面",
          length: 5,
          friction: 0.42,
          locked: true,
        },
        {
          kind: "block",
          name: "滑块",
          mass: 1,
          initialVelocity: { x: 3, y: 0 },
        },
      ],
      relationships: [
        {
          kind: "place-on",
          entity: "滑块",
          target: "粗糙水平面",
          position: "left",
        },
      ],
      assumptions: ["题干未给出水平面长度，默认 5 m。"],
      warnings: [],
      unsupported: [],
    });

    expect(draft.entities).toHaveLength(2);
    expect(draft.gravity).toBe(10);
    expect(draft.warnings).toEqual([]);
  });

  it("rejects unsupported non-mechanics domains", () => {
    expect(() =>
      validateSceneDraft({
        title: "带电粒子运动",
        locale: "zh-CN",
        domain: "electromagnetism",
        entities: [],
        relationships: [],
        assumptions: [],
        warnings: [],
        unsupported: ["电场"],
      }),
    ).toThrow(/mechanics/i);
  });

  it("rejects negative movable body mass", () => {
    expect(() =>
      validateSceneDraft({
        title: "负质量物块",
        locale: "zh-CN",
        domain: "mechanics",
        entities: [
          {
            kind: "block",
            name: "物块",
            mass: -1,
          },
        ],
        relationships: [],
        assumptions: [],
        warnings: [],
        unsupported: [],
      }),
    ).toThrow(/mass/i);
  });

  it("normalizes negative friction to zero with a warning", () => {
    const draft = validateSceneDraft({
      title: "异常摩擦",
      locale: "zh-CN",
      domain: "mechanics",
      entities: [
        {
          kind: "board",
          name: "木板",
          friction: -0.1,
        },
      ],
      relationships: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.entities[0]?.friction).toBe(0);
    expect(draft.warnings.some((warning) => warning.includes("friction"))).toBe(true);
  });

  it("rejects relationships that reference unknown entities", () => {
    expect(() =>
      validateSceneDraft({
        title: "未知引用",
        locale: "zh-CN",
        domain: "mechanics",
        entities: [
          {
            kind: "block",
            name: "物块",
          },
        ],
        relationships: [
          {
            kind: "place-on",
            entity: "物块",
            target: "不存在的木板",
          },
        ],
        assumptions: [],
        warnings: [],
        unsupported: [],
      }),
    ).toThrow(/unknown/i);
  });

  it("adds an implicit locked horizontal ground board for place-on ground references", () => {
    const draft = validateSceneDraft({
      title: "水平地面上两物块弹簧释放",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "block",
          name: "A",
          mass: 1,
          friction: 0.2,
          restitution: 1,
        },
        {
          kind: "block",
          name: "B",
          mass: 4,
          friction: 0.2,
          restitution: 1,
        },
      ],
      relationships: [
        {
          kind: "place-on",
          entity: "A",
          target: "ground",
          position: "center",
        },
        {
          kind: "place-on",
          entity: "B",
          target: "ground",
          position: "left",
        },
      ],
      analyzers: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.entities).toContainEqual(
      expect.objectContaining({
        angleDegrees: 0,
        kind: "board",
        locked: true,
        name: "水平地面",
      }),
    );
    expect(draft.relationships).toEqual([
      expect.objectContaining({
        entity: "A",
        kind: "place-on",
        target: "水平地面",
      }),
      expect.objectContaining({
        entity: "B",
        kind: "place-on",
        target: "水平地面",
      }),
    ]);
    expect(draft.assumptions).toContain("题干引用了地面/水平面，已自动创建锁定的水平地面。");
  });

  it("accepts an instantaneous energy release between two bodies", () => {
    const draft = validateSceneDraft({
      title: "压缩弹簧释放后消失",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "block", name: "A", mass: 1 },
        { kind: "block", name: "B", mass: 4 },
      ],
      relationships: [
        {
          direction: { x: 1, y: 0 },
          entityA: "A",
          entityB: "B",
          kind: "energy-release",
          totalKineticEnergy: 10,
        },
      ],
      analyzers: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.relationships).toContainEqual({
      direction: { x: 1, y: 0 },
      entityA: "A",
      entityB: "B",
      kind: "energy-release",
      totalKineticEnergy: 10,
    });
  });

  it("accepts circular arc tracks and endpoint connection relationships", () => {
    const draft = validateSceneDraft({
      title: "斜面-圆弧-水平轨道",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "board",
          name: "粗糙斜面",
          length: 4,
          friction: 0.25,
          angleDegrees: 37,
          locked: true,
        },
        {
          kind: "arc-track",
          name: "光滑圆弧",
          radius: 0.5,
          sweepAngleDegrees: 37,
          friction: 0,
          anchorEntity: "粗糙斜面",
          anchorEndpoint: "end",
          entryEndpoint: "start",
        },
        {
          kind: "board",
          name: "水平光滑轨道",
          length: 5,
          friction: 0,
          angleDegrees: 0,
          locked: true,
        },
      ],
      relationships: [
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
      ],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.entities.find((entity) => entity.kind === "arc-track")).toMatchObject({
      anchorEntity: "粗糙斜面",
      anchorEndpoint: "end",
      entryEndpoint: "start",
      friction: 0,
      radius: 0.5,
      sweepAngleDegrees: 37,
    });
    expect(draft.relationships).toContainEqual(
      expect.objectContaining({
        kind: "connect-endpoints",
        source: "粗糙斜面",
        target: "光滑圆弧",
      }),
    );
  });

  it("accepts a contact-style spring end with an initial target gap", () => {
    const draft = validateSceneDraft({
      title: "木块先接触弹簧自由端再压缩弹簧",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "board", name: "水平轨道", length: 5, friction: 0, locked: true },
        { kind: "block", name: "木块", mass: 2, friction: 0 },
        { kind: "block", name: "弹簧固定端", locked: true, width: 0.16, height: 0.52 },
      ],
      relationships: [
        {
          anchor: "弹簧固定端",
          gap: 0.2,
          kind: "contact-spring-end",
          restLength: 0.5,
          stiffness: 100,
          target: "木块",
        },
      ],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.relationships).toContainEqual(
      expect.objectContaining({
        anchor: "弹簧固定端",
        gap: 0.2,
        kind: "contact-spring-end",
        restLength: 0.5,
        stiffness: 100,
        target: "木块",
      }),
    );
  });

  it("treats zero relationship rest length and stiffness as unspecified AI draft values", () => {
    const draft = validateSceneDraft({
      title: "弹簧参数待确认",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "block", name: "固定端", locked: true },
        { kind: "block", name: "木块", mass: 2 },
      ],
      relationships: [
        {
          anchor: "固定端",
          gap: 0,
          kind: "contact-spring-end",
          restLength: 0,
          stiffness: 0,
          target: "木块",
        },
      ],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.relationships[0]).toEqual({
      anchor: "固定端",
      gap: 0,
      kind: "contact-spring-end",
      restLength: undefined,
      stiffness: undefined,
      target: "木块",
    });
  });

  it("normalizes oversized board height as an exam vertical-height hint instead of rail thickness", () => {
    const draft = validateSceneDraft({
      title: "斜面高度题",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "board",
          name: "粗糙斜面",
          length: 4,
          height: 2.4,
          friction: 0.25,
          angleDegrees: 37,
          locked: true,
        },
      ],
      relationships: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.entities[0]?.height).toBeUndefined();
    expect(draft.warnings.some((warning) => warning.includes("height"))).toBe(true);
  });

  it("maps generic analyzer entity names to the unique matching entity kind", () => {
    const draft = validateSceneDraft({
      title: "追踪小球",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          kind: "ball",
          name: "小球",
          mass: 1,
        },
      ],
      relationships: [],
      analyzers: [
        {
          kind: "trajectory",
          entity: "ball",
        },
      ],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    expect(draft.analyzers).toEqual([
      {
        kind: "trajectory",
        entity: "小球",
      },
    ]);
  });
});
