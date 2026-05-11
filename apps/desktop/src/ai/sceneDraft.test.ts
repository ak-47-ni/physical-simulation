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
});
