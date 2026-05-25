import { describe, expect, it } from "vitest";

import { createSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { validateSceneDraft } from "./sceneDraft";
import { compileSceneDraft } from "./sceneDraftCompiler";
import {
  createSceneGenerationBaselineSummary,
  hashSceneGenerationBaselineSummary,
} from "./sceneGenerationBaselineSummary";

describe("scene generation baseline summary", () => {
  it("captures the stable physics structure without preserving labels or positions", () => {
    const draft = validateSceneDraft({
      title: "小球自由落体",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 9.8,
      entities: [
        {
          center: { x: 2.5, y: 1 },
          initialVelocity: { x: 0, y: 0 },
          kind: "ball",
          mass: 0.2,
          name: "小球",
          radius: 0.12,
        },
      ],
      relationships: [],
      analyzers: [{ kind: "trajectory", entity: "小球" }],
      assumptions: ["忽略空气阻力。"],
      warnings: [],
      unsupported: [],
    });
    const compiled = compileSceneDraft({
      draft,
      existingConstraints: [],
      existingEntities: [],
      mode: "replace",
      settings: createSceneAuthoringSettings({
        gravity: 9.8,
        lengthUnit: "m",
        pixelsPerMeter: 100,
      }),
    });

    expect(createSceneGenerationBaselineSummary(compiled)).toEqual({
      constraints: [],
      entityKindCounts: {
        ball: 1,
      },
      entities: [
        {
          friction: 0,
          id: "ai-ball-1",
          kind: "ball",
          locked: false,
          mass: 0.2,
          restitution: 1,
          shape: {
            radius: 0.12,
          },
          velocity: {
            x: 0,
            y: 0,
          },
        },
      ],
      gravity: 9.8,
      visibleTrajectoryEntityIds: ["ai-ball-1"],
    });
  });

  it("produces the same hash for objects with equivalent semantic structure", () => {
    const first = {
      gravity: 9.8,
      visibleTrajectoryEntityIds: ["b", "a"],
      entityKindCounts: { ball: 2 },
      entities: [
        { id: "b", kind: "ball", mass: 1 },
        { id: "a", kind: "ball", mass: 1 },
      ],
      constraints: [],
    };
    const second = {
      constraints: [],
      entities: [
        { kind: "ball", mass: 1, id: "b" },
        { mass: 1, id: "a", kind: "ball" },
      ],
      entityKindCounts: { ball: 2 },
      visibleTrajectoryEntityIds: ["b", "a"],
      gravity: 9.8,
    };

    expect(hashSceneGenerationBaselineSummary(second)).toBe(
      hashSceneGenerationBaselineSummary(first),
    );
  });
});

