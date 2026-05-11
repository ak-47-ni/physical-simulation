import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateSceneDraft } from "../ai/sceneDraft";
import { TextToSceneModal } from "./TextToSceneModal";

describe("TextToSceneModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("collects prompt text and requests a draft", () => {
    const onGenerateDraft = vi.fn();

    render(
      <TextToSceneModal
        draft={null}
        errorMessage={null}
        generating={false}
        onCancel={() => undefined}
        onGenerateDraft={onGenerateDraft}
        onInsert={() => undefined}
        onReplace={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Exam prompt"), {
      target: { value: "在水平面上放一个物块" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));

    expect(onGenerateDraft).toHaveBeenCalledWith("在水平面上放一个物块");
  });

  it("shows loading state", () => {
    render(
      <TextToSceneModal
        draft={null}
        errorMessage={null}
        generating={true}
        onCancel={() => undefined}
        onGenerateDraft={() => undefined}
        onInsert={() => undefined}
        onReplace={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Generating…" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("shows draft entities, assumptions, and warnings before apply actions", () => {
    const onReplace = vi.fn();
    const onInsert = vi.fn();
    const draft = validateSceneDraft({
      title: "粗糙水平面",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [{ kind: "block", name: "滑块", mass: 1 }],
      relationships: [],
      assumptions: ["默认水平面长度 5 m"],
      warnings: ["未识别题目设问"],
      unsupported: [],
    });

    render(
      <TextToSceneModal
        draft={draft}
        errorMessage={null}
        generating={false}
        onCancel={() => undefined}
        onGenerateDraft={() => undefined}
        onInsert={onInsert}
        onReplace={onReplace}
      />,
    );

    expect(screen.getByText("滑块")).toBeTruthy();
    expect(screen.getByText("默认水平面长度 5 m")).toBeTruthy();
    expect(screen.getByText("未识别题目设问")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Replace current scene" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert into current scene" }));

    expect(onReplace).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledOnce();
  });
});
