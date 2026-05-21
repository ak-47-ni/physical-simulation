import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateSceneDraft } from "../ai/sceneDraft";
import { APP_LOCALE_STORAGE_KEY, LanguageProvider } from "../i18n";
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

    expect(screen.getByText(/滑块/)).toBeTruthy();
    expect(screen.getByDisplayValue("默认水平面长度 5 m")).toBeTruthy();
    expect(screen.getByDisplayValue("未识别题目设问")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Replace current scene" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert into current scene" }));

    expect(onReplace).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledOnce();
  });

  it("lets users edit generated parameters before applying the draft", () => {
    const onReplace = vi.fn();
    const draft = validateSceneDraft({
      title: "弹簧接触题",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        { kind: "ball", name: "小球", mass: 1, radius: 0.24 },
        { kind: "block", name: "木块", mass: 2, friction: 0 },
        { kind: "block", name: "固定端", locked: true },
      ],
      relationships: [
        {
          anchor: "固定端",
          gap: 0.2,
          kind: "contact-spring-end",
          restLength: 0.5,
          stiffness: 100,
          target: "木块",
        },
      ],
      assumptions: ["水平轨道长度默认 5 m"],
      warnings: ["弹簧自由端使用接触端近似"],
      unsupported: [],
    });

    render(
      <TextToSceneModal
        draft={draft}
        errorMessage={null}
        generating={false}
        onCancel={() => undefined}
        onGenerateDraft={() => undefined}
        onInsert={() => undefined}
        onReplace={onReplace}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit scene gravity"), {
      target: { value: "9.8" },
    });
    fireEvent.change(screen.getByLabelText("Edit 小球 mass"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByLabelText("Edit contact spring gap 固定端 to 木块"), {
      target: { value: "0.3" },
    });
    fireEvent.change(screen.getByLabelText("Edit assumption 1"), {
      target: { value: "水平轨道长度由用户确认 6 m" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace current scene" }));

    const appliedDraft = onReplace.mock.calls[0]?.[0];

    expect(appliedDraft.gravity).toBe(9.8);
    expect(appliedDraft.entities.find((entity) => entity.name === "小球")?.mass).toBe(1.5);
    expect(appliedDraft.relationships[0]).toMatchObject({
      gap: 0.3,
      kind: "contact-spring-end",
    });
    expect(appliedDraft.assumptions).toEqual(["水平轨道长度由用户确认 6 m"]);
  });

  it("lets users edit instantaneous energy release totals before applying the draft", () => {
    const onReplace = vi.fn();
    const draft = validateSceneDraft({
      title: "压缩弹簧瞬时释放",
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
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    render(
      <TextToSceneModal
        draft={draft}
        errorMessage={null}
        generating={false}
        onCancel={() => undefined}
        onGenerateDraft={() => undefined}
        onInsert={() => undefined}
        onReplace={onReplace}
      />,
    );

    fireEvent.change(screen.getByLabelText("Edit energy release totalKineticEnergy A to B"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace current scene" }));

    expect(onReplace.mock.calls[0]?.[0].relationships[0]).toMatchObject({
      kind: "energy-release",
      totalKineticEnergy: 12,
    });
  });

  it("localizes generated parameter labels and entity kind names", () => {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, "zh-CN");
    const draft = validateSceneDraft({
      title: "斜面题",
      locale: "zh-CN",
      domain: "mechanics",
      gravity: 10,
      entities: [
        {
          angleDegrees: 37,
          kind: "board",
          length: 4,
          name: "rough_incline",
        },
      ],
      relationships: [],
      assumptions: [],
      warnings: [],
      unsupported: [],
    });

    render(
      <LanguageProvider>
        <TextToSceneModal
          draft={draft}
          errorMessage={null}
          generating={false}
          onCancel={() => undefined}
          onGenerateDraft={() => undefined}
          onInsert={() => undefined}
          onReplace={() => undefined}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText("rough_incline · 木板")).toBeTruthy();
    expect(screen.getByText("长度")).toBeTruthy();
    expect(screen.getByText("角度")).toBeTruthy();
    expect(screen.queryByText("rough_incline · board")).toBeNull();
  });
});
