import { describe, expect, it } from "vitest";

import { messages, type MessageKey } from "../i18n";
import { SceneGenerationError } from "./textToSceneClient";
import { readSceneGenerationUserMessage } from "./sceneGenerationErrorMessage";

const zh = (key: MessageKey) => messages["zh-CN"][key];

describe("readSceneGenerationUserMessage", () => {
  it("maps provider errors to a Chinese recovery message", () => {
    const message = readSceneGenerationUserMessage(
      new SceneGenerationError({
        detail: "OpenAI scene generation failed (401): [REDACTED]",
        kind: "provider",
        message: "raw provider message",
      }),
      zh,
    );

    expect(message).toContain("无法生成物理场景");
    expect(message).toContain("检查 AI 服务配置");
    expect(message).toContain("[REDACTED]");
  });

  it("maps invalid JSON and schema errors to prompt-simplification guidance", () => {
    expect(
      readSceneGenerationUserMessage(
        new SceneGenerationError({
          kind: "invalid-json",
          message: "raw invalid json message",
        }),
        zh,
      ),
    ).toContain("AI 返回的内容不是可用的场景 JSON");

    expect(
      readSceneGenerationUserMessage(
        new SceneGenerationError({
          detail: "Scene draft domain must be mechanics.",
          kind: "schema-invalid",
          message: "raw schema message",
        }),
        zh,
      ),
    ).toContain("生成结果不符合场景结构");
  });

  it("falls back to the original message for unknown errors", () => {
    expect(readSceneGenerationUserMessage(new Error("raw failure"), zh)).toBe("raw failure");
  });
});
