import { describe, expect, it, vi } from "vitest";

import { generateSceneDraftFromText } from "./textToSceneClient";

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
    await expect(
      generateSceneDraftFromText({
        invoke: null,
        prompt: "测试",
      }),
    ).rejects.toThrow(/desktop ai generation is unavailable/i);
  });
});
