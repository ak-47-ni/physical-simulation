import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { createRuntimeCompileRequestFromEditorState } from "../state/runtimeCompileRequest";
import { createSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import type { EditorConstraint } from "../state/editorConstraints";
import type { EditorSceneEntity } from "../state/editorStore";
import { validateSceneDraft, type SceneDraft } from "./sceneDraft";
import { compileSceneDraft, type CompiledSceneDraft } from "./sceneDraftCompiler";
import {
  createSceneGenerationBaselineSummary,
  hashSceneGenerationBaselineSummary,
  type SceneGenerationBaselineSummary,
} from "./sceneGenerationBaselineSummary";

type BaselineCase = {
  assert: (result: {
    compiled: CompiledSceneDraft;
    draft: SceneDraft;
    runtimeRequest: ReturnType<typeof createRuntimeCompileRequestFromEditorState>;
  }) => void;
  candidate: unknown;
  expectedSummaryHash: string;
  prompt: string;
};

type BaselineArtifactRecord = {
  prompt: string;
  summary: SceneGenerationBaselineSummary;
  summaryHash: string;
};

const settings = createSceneAuthoringSettings({
  gravity: 9.8,
  lengthUnit: "m",
  pixelsPerMeter: 100,
});

const baselineCases: BaselineCase[] = [
  {
    prompt: "生成一个小球自由落体实验场景",
    expectedSummaryHash: "463fa7a6",
    candidate: {
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
    },
    assert: ({ compiled, draft, runtimeRequest }) => {
      expect(draft.entities).toHaveLength(1);
      expect(draft.entities[0]).toMatchObject({
        kind: "ball",
        mass: 0.2,
        name: "小球",
        radius: 0.12,
      });
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          id: "ai-ball-1",
          kind: "ball",
          label: "小球",
          locked: false,
          velocityX: 0,
          velocityY: 0,
        }),
      );
      expect(compiled.constraints).toEqual([]);
      expect(compiled.visibleTrajectoryEntityIds.has("ai-ball-1")).toBe(true);
      expect(runtimeRequest.scene.forceSources).toContainEqual(
        expect.objectContaining({
          acceleration: { x: 0, y: 9.8 },
          kind: "gravity",
        }),
      );
    },
  },
  {
    prompt: "生成一个斜面上木块下滑的实验场景",
    expectedSummaryHash: "dc18a917",
    candidate: {
      title: "斜面上木块下滑",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 9.8,
      entities: [
        {
          angleDegrees: 30,
          friction: 0.2,
          height: 0.14,
          kind: "board",
          length: 4,
          locked: true,
          name: "斜面",
        },
        {
          height: 0.35,
          initialVelocity: { x: 0, y: 0 },
          kind: "block",
          mass: 1,
          name: "木块",
          width: 0.5,
        },
      ],
      relationships: [{ kind: "place-on", entity: "木块", target: "斜面", position: "left" }],
      analyzers: [{ kind: "trajectory", entity: "木块" }],
      assumptions: ["斜面固定，木块从斜面上端静止释放。"],
      warnings: [],
      unsupported: [],
    },
    assert: ({ compiled, draft }) => {
      expect(draft.relationships).toContainEqual({
        entity: "木块",
        kind: "place-on",
        position: "left",
        target: "斜面",
      });
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          friction: 0.2,
          id: "ai-board-1",
          kind: "board",
          label: "斜面",
          locked: true,
          rotationDegrees: 30,
        }),
      );
      const board = compiled.entities.find((entity) => entity.id === "ai-board-1");
      const block = compiled.entities.find((entity) => entity.id === "ai-block-1");

      expect(block).toMatchObject({
        kind: "block",
        label: "木块",
        locked: false,
        mass: 1,
      });
      expect(block?.y).toBeLessThan(board?.y ?? 0);
      expect(compiled.visibleTrajectoryEntityIds.has("ai-block-1")).toBe(true);
    },
  },
  {
    prompt: "生成两个小球发生弹性碰撞的场景",
    expectedSummaryHash: "9b742227",
    candidate: {
      title: "两个小球弹性碰撞",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 9.8,
      entities: [
        {
          friction: 0,
          height: 0.14,
          kind: "board",
          length: 5,
          locked: true,
          name: "水平轨道",
        },
        {
          initialVelocity: { x: 1.5, y: 0 },
          kind: "ball",
          mass: 1,
          name: "小球A",
          radius: 0.15,
          restitution: 1,
        },
        {
          initialVelocity: { x: 0, y: 0 },
          kind: "ball",
          mass: 1,
          name: "小球B",
          radius: 0.15,
          restitution: 1,
        },
      ],
      relationships: [
        { kind: "place-on", entity: "小球A", target: "水平轨道", position: "left" },
        { kind: "place-on", entity: "小球B", target: "水平轨道", position: "center" },
      ],
      analyzers: [
        { kind: "trajectory", entity: "小球A" },
        { kind: "trajectory", entity: "小球B" },
      ],
      assumptions: ["水平轨道光滑，两球质量相等，碰撞为正碰。"],
      warnings: [],
      unsupported: [],
    },
    assert: ({ compiled, draft }) => {
      expect(draft.entities.filter((entity) => entity.kind === "ball")).toHaveLength(2);
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          id: "ai-ball-1",
          kind: "ball",
          label: "小球A",
          restitution: 1,
          velocityX: 1.5,
          velocityY: 0,
        }),
      );
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          id: "ai-ball-2",
          kind: "ball",
          label: "小球B",
          restitution: 1,
          velocityX: 0,
          velocityY: 0,
        }),
      );
      expect(compiled.constraints).toEqual([]);
      expect(compiled.visibleTrajectoryEntityIds).toEqual(new Set(["ai-ball-1", "ai-ball-2"]));
    },
  },
  {
    prompt: "生成一个弹簧连接小车的简谐运动场景",
    expectedSummaryHash: "0ccaf805",
    candidate: {
      title: "弹簧连接小车简谐运动",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 9.8,
      entities: [
        {
          friction: 0,
          height: 0.14,
          kind: "board",
          length: 5,
          locked: true,
          name: "水平光滑轨道",
        },
        {
          height: 0.5,
          kind: "block",
          locked: true,
          mass: 5,
          name: "固定墙",
          width: 0.16,
        },
        {
          height: 0.4,
          initialVelocity: { x: 0, y: 0 },
          kind: "block",
          mass: 1,
          name: "小车",
          width: 0.7,
        },
      ],
      relationships: [
        { kind: "place-on", entity: "固定墙", target: "水平光滑轨道", position: "left" },
        { kind: "place-on", entity: "小车", target: "水平光滑轨道", position: "center" },
        {
          entityA: "固定墙",
          entityB: "小车",
          kind: "spring-between",
          restLength: 1,
          stiffness: 20,
        },
      ],
      analyzers: [{ kind: "trajectory", entity: "小车" }],
      assumptions: ["小车在光滑水平轨道上运动，弹簧质量忽略。"],
      warnings: [],
      unsupported: [],
    },
    assert: ({ compiled, runtimeRequest }) => {
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          id: "ai-block-1",
          kind: "block",
          label: "固定墙",
          locked: true,
        }),
      );
      expect(compiled.entities).toContainEqual(
        expect.objectContaining({
          id: "ai-block-2",
          kind: "block",
          label: "小车",
          locked: false,
          mass: 1,
        }),
      );
      expect(compiled.constraints).toContainEqual(
        expect.objectContaining({
          entityAId: "ai-block-1",
          entityBId: "ai-block-2",
          kind: "spring",
          restLength: 1,
          stiffness: 20,
        }),
      );
      expect(runtimeRequest.scene.constraints).toContainEqual(
        expect.objectContaining({
          entityAId: "ai-block-1",
          entityBId: "ai-block-2",
          kind: "spring",
          restLength: 1,
          stiffness: 20,
        }),
      );
    },
  },
];

describe("fixed prompt scene generation baseline", () => {
  for (const baselineCase of baselineCases) {
    it(`validates and compiles baseline prompt: ${baselineCase.prompt}`, () => {
      const draft = validateSceneDraft(baselineCase.candidate);
      const compiled = compileSceneDraft({
        draft,
        existingConstraints: [],
        existingEntities: [],
        mode: "replace",
        settings,
      });
      const runtimeRequest = createRuntimeCompileRequestFromEditorState({
        constraints: compiled.constraints,
        entities: compiled.entities,
        settings,
      });

      expect(draft.domain).toBe("mechanics");
      expect(draft.locale).toBe("zh-CN");
      expect(compiled.entities.length).toBeGreaterThan(0);
      expect(new Set(compiled.entities.map((entity) => entity.id)).size).toBe(
        compiled.entities.length,
      );
      expect(runtimeRequest.scene.entities.length).toBe(compiled.entities.length);
      expect(runtimeRequest.scene.forceSources).toContainEqual(
        expect.objectContaining({ kind: "gravity" }),
      );
      expect(hashSceneGenerationBaselineSummary(createSceneGenerationBaselineSummary(compiled))).toBe(
        baselineCase.expectedSummaryHash,
      );

      baselineCase.assert({ compiled, draft, runtimeRequest });
    });

    it(`keeps local validation and compilation deterministic for baseline prompt: ${baselineCase.prompt}`, () => {
      const first = compileBaselineCase(baselineCase);
      const second = compileBaselineCase(baselineCase);
      const firstSummary = createSceneGenerationBaselineSummary(first);
      const secondSummary = createSceneGenerationBaselineSummary(second);

      expect(readCompiledStructuralSnapshot(second)).toEqual(
        readCompiledStructuralSnapshot(first),
      );
      expect(secondSummary).toEqual(firstSummary);
      expect(hashSceneGenerationBaselineSummary(secondSummary)).toBe(
        hashSceneGenerationBaselineSummary(firstSummary),
      );
    });
  }

  it("writes a non-secret baseline artifact when explicitly requested", () => {
    const outputPath = process.env.PHYSICS_SANDBOX_BASELINE_ARTIFACT_PATH;

    if (!outputPath) {
      expect(outputPath).toBeUndefined();
      return;
    }

    const records = baselineCases.map(createBaselineArtifactRecord);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");

    expect(records.map((record) => record.summaryHash)).toEqual(
      baselineCases.map((baselineCase) => baselineCase.expectedSummaryHash),
    );
  });
});

function compileBaselineCase(baselineCase: BaselineCase): CompiledSceneDraft {
  return compileSceneDraft({
    draft: validateSceneDraft(baselineCase.candidate),
    existingConstraints: [],
    existingEntities: [],
    mode: "replace",
    settings,
  });
}

function readCompiledStructuralSnapshot(compiled: CompiledSceneDraft): {
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  gravity: number;
  selectedEntityId: string | null;
  visibleTrajectoryEntityIds: string[];
} {
  return {
    constraints: compiled.constraints,
    entities: compiled.entities,
    gravity: compiled.gravity,
    selectedEntityId: compiled.selectedEntityId,
    visibleTrajectoryEntityIds: [...compiled.visibleTrajectoryEntityIds].sort(),
  };
}

function createBaselineArtifactRecord(baselineCase: BaselineCase): BaselineArtifactRecord {
  const compiled = compileBaselineCase(baselineCase);
  const summary = createSceneGenerationBaselineSummary(compiled);

  return {
    prompt: baselineCase.prompt,
    summary,
    summaryHash: hashSceneGenerationBaselineSummary(summary),
  };
}
