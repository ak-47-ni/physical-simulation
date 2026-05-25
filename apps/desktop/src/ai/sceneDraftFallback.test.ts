import { describe, expect, it } from "vitest";

import { createRuntimeCompileRequestFromEditorState } from "../state/runtimeCompileRequest";
import { createSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { compileSceneDraft } from "./sceneDraftCompiler";
import {
  createSceneDraftFallbackFromText,
  readSceneDraftFallbackKind,
} from "./sceneDraftFallback";
import {
  createSceneGenerationBaselineSummary,
  hashSceneGenerationBaselineSummary,
} from "./sceneGenerationBaselineSummary";

const settings = createSceneAuthoringSettings({
  gravity: 9.8,
  lengthUnit: "m",
  pixelsPerMeter: 100,
});

const fallbackCases = [
  {
    expectedHash: "463fa7a6",
    expectedKind: "free-fall",
    prompt: "生成一个小球自由落体实验场景",
  },
  {
    expectedHash: "dc18a917",
    expectedKind: "incline-block",
    prompt: "生成一个斜面上木块下滑的实验场景",
  },
  {
    expectedHash: "9b742227",
    expectedKind: "elastic-collision",
    prompt: "生成两个小球发生弹性碰撞的场景",
  },
  {
    expectedHash: "0ccaf805",
    expectedKind: "spring-cart",
    prompt: "生成一个弹簧连接小车的简谐运动场景",
  },
] as const;

describe("scene draft fallback", () => {
  for (const fallbackCase of fallbackCases) {
    it(`creates a deterministic compiled fallback for ${fallbackCase.expectedKind}`, () => {
      const first = createSceneDraftFallbackFromText(fallbackCase.prompt, {
        reason: "AI 服务暂不可用",
      });
      const second = createSceneDraftFallbackFromText(fallbackCase.prompt, {
        reason: "AI 服务暂不可用",
      });

      expect(readSceneDraftFallbackKind(fallbackCase.prompt)).toBe(fallbackCase.expectedKind);
      expect(first).toEqual(second);
      expect(first).not.toBeNull();
      expect(first?.warnings).toContain("AI 服务暂不可用，已使用本地确定性模板生成草稿。");

      const compiled = compileSceneDraft({
        draft: first!,
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

      expect(runtimeRequest.scene.entities.length).toBe(compiled.entities.length);
      expect(hashSceneGenerationBaselineSummary(createSceneGenerationBaselineSummary(compiled))).toBe(
        fallbackCase.expectedHash,
      );
    });
  }

  it("returns null for prompts outside the supported fallback set", () => {
    expect(createSceneDraftFallbackFromText("生成一个复杂滑轮组实验", { reason: "失败" })).toBeNull();
    expect(readSceneDraftFallbackKind("生成一个复杂滑轮组实验")).toBeNull();
  });
});
