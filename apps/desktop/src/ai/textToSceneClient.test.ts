import { describe, expect, it, vi } from "vitest";

import { generateSceneDraftFromText, SceneGenerationError } from "./textToSceneClient";

describe("generateSceneDraftFromText", () => {
  it("sends the prompt to the desktop generate_scene_draft command", async () => {
    const invoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        title: "测试",
        locale: "zh-CN",
        domain: "mechanics",
        entities: [],
        relationships: [],
        assumptions: [],
        warnings: [],
        unsupported: [],
      }),
    );

    const draft = await generateSceneDraftFromText({
      invoke,
      prompt: "在水平面上放一个物块",
    });

    expect(invoke).toHaveBeenCalledWith("generate_scene_draft", {
      prompt: "在水平面上放一个物块",
    });
    expect(draft.title).toBe("测试");
  });

  it("throws a clear error when the desktop command is unavailable", async () => {
    try {
      await generateSceneDraftFromText({
        invoke: null,
        prompt: "测试",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SceneGenerationError);
      expect((error as SceneGenerationError).kind).toBe("unavailable");
      expect((error as Error).message).toMatch(/desktop ai generation is unavailable/i);
      return;
    }

    throw new Error("expected generateSceneDraftFromText to reject");
  });

  it("falls back to a deterministic local draft when desktop AI is unavailable for a supported prompt", async () => {
    const draft = await generateSceneDraftFromText({
      invoke: null,
      prompt: "生成一个小球自由落体实验场景",
    });

    expect(draft).toMatchObject({
      title: "小球自由落体",
      entities: [
        expect.objectContaining({
          kind: "ball",
          name: "小球",
        }),
      ],
      warnings: ["当前无法使用桌面 AI 生成功能，已使用本地确定性模板生成草稿。"],
    });
  });

  it("turns desktop command string errors into actionable guidance", async () => {
    const invoke = vi.fn().mockRejectedValue("OpenAI scene generation failed (404): not found");

    try {
      await generateSceneDraftFromText({
        invoke,
        prompt: "测试",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SceneGenerationError);
      expect((error as SceneGenerationError).kind).toBe("provider");
      expect((error as SceneGenerationError).detail).toBe(
        "OpenAI scene generation failed (404): not found",
      );
      expect((error as Error).message).toContain("Couldn't generate a physics scene.");
      expect((error as Error).message).toContain("Check the AI provider settings");
      expect((error as Error).message).toContain("OpenAI scene generation failed (404): not found");
      return;
    }

    throw new Error("expected generateSceneDraftFromText to reject");
  });

  it("falls back to a deterministic local draft when provider generation fails for a supported prompt", async () => {
    const invoke = vi.fn().mockRejectedValue("OpenAI scene generation failed (500): unavailable");

    const draft = await generateSceneDraftFromText({
      invoke,
      prompt: "生成一个斜面上木块下滑的实验场景",
    });

    expect(draft).toMatchObject({
      title: "斜面上木块下滑",
      relationships: [
        expect.objectContaining({
          entity: "木块",
          kind: "place-on",
          target: "斜面",
        }),
      ],
      warnings: ["AI 服务生成失败，已使用本地确定性模板生成草稿。"],
    });
  });

  it("explains invalid JSON responses with a recovery step", async () => {
    const invoke = vi.fn().mockResolvedValue("not-json");

    try {
      await generateSceneDraftFromText({
        invoke,
        prompt: "测试",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SceneGenerationError);
      expect((error as SceneGenerationError).kind).toBe("invalid-json");
      expect((error as Error).message).toMatch(
        /AI response was not valid JSON.*Try again with one simple experiment/i,
      );
      return;
    }

    throw new Error("expected generateSceneDraftFromText to reject");
  });

  it("falls back to a deterministic local draft when provider returns invalid JSON for a supported prompt", async () => {
    const invoke = vi.fn().mockResolvedValue("not-json");

    const draft = await generateSceneDraftFromText({
      invoke,
      prompt: "生成两个小球发生弹性碰撞的场景",
    });

    expect(draft).toMatchObject({
      title: "两个小球弹性碰撞",
      entities: [
        expect.objectContaining({ name: "水平轨道" }),
        expect.objectContaining({ name: "小球A" }),
        expect.objectContaining({ name: "小球B" }),
      ],
      warnings: ["AI 返回内容无法解析，已使用本地确定性模板生成草稿。"],
    });
  });

  it("explains scene schema validation failures with a recovery step", async () => {
    const invoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        title: "测试",
        locale: "zh-CN",
        domain: "chemistry",
        entities: [],
        relationships: [],
        assumptions: [],
        warnings: [],
        unsupported: [],
      }),
    );

    try {
      await generateSceneDraftFromText({
        invoke,
        prompt: "测试",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SceneGenerationError);
      expect((error as SceneGenerationError).kind).toBe("schema-invalid");
      expect((error as SceneGenerationError).detail).toBe(
        "Scene draft domain must be mechanics.",
      );
      expect((error as Error).message).toMatch(
        /generated scene did not match the scene schema.*mechanics/i,
      );
      return;
    }

    throw new Error("expected generateSceneDraftFromText to reject");
  });

  it("falls back to a deterministic local draft when provider returns schema-invalid data for a supported prompt", async () => {
    const invoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        title: "测试",
        locale: "zh-CN",
        domain: "chemistry",
        entities: [],
        relationships: [],
        assumptions: [],
        warnings: [],
        unsupported: [],
      }),
    );

    const draft = await generateSceneDraftFromText({
      invoke,
      prompt: "生成一个弹簧连接小车的简谐运动场景",
    });

    expect(draft.title).toBe("弹簧连接小车简谐运动");
    expect(draft.relationships).toContainEqual(
      expect.objectContaining({
        entityA: "固定墙",
        entityB: "小车",
        kind: "spring-between",
      }),
    );
    expect(draft.warnings).toEqual(["AI 返回场景结构不可用，已使用本地确定性模板生成草稿。"]);
  });

  it("redacts API-key-shaped secrets from generation errors", async () => {
    const invoke = vi.fn().mockRejectedValue("provider rejected sk-secret-value");

    try {
      await generateSceneDraftFromText({
        invoke,
        prompt: "测试",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain("sk-secret-value");
      return;
    }

    throw new Error("expected generateSceneDraftFromText to reject");
  });
});
