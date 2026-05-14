import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";

function mockSystemLanguage(language: string) {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(language);
}

function renderDesktopApp() {
  return render(<App />);
}

function getLanguageSelect() {
  return screen.getByRole("combobox", { name: /language|语言/i }) as HTMLSelectElement;
}

function readStoredValues() {
  return Object.keys(window.localStorage).map((key) => window.localStorage.getItem(key));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("desktop language switch acceptance", () => {
  it("shows an English version badge sourced from the top bar", () => {
    mockSystemLanguage("en-US");

    renderDesktopApp();

    expect(screen.getByText("Version 1.0.56")).toBeDefined();
  });

  it("defaults non-zh system locales to English", () => {
    mockSystemLanguage("en-US");

    renderDesktopApp();

    expect(getLanguageSelect().value).toBe("en");
    expect(screen.getByRole("option", { name: "English" })).toBeDefined();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeDefined();
  });

  it.each(["zh-CN", "zh-TW", "zh-HK", "zh-MO"])(
    "defaults %s to 简体中文 when no saved preference exists",
    (systemLanguage) => {
      mockSystemLanguage(systemLanguage);

      renderDesktopApp();

      expect(getLanguageSelect().value).toBe("zh-CN");
      expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
      expect(screen.getByText("版本 1.0.56")).toBeDefined();
    },
  );

  it("keeps Reset layout directly before the language select in the top bar action group", () => {
    mockSystemLanguage("en-US");

    renderDesktopApp();

    const resetButton = screen.getByRole("button", { name: /reset layout/i });
    const languageSelect = getLanguageSelect();
    const nextSibling = resetButton.nextElementSibling as HTMLElement | null;

    expect(nextSibling).not.toBeNull();
    expect(nextSibling === languageSelect || nextSibling?.contains(languageSelect)).toBe(true);
    expect(resetButton.parentElement?.contains(languageSelect)).toBe(true);
  });

  it("switches to 简体中文, persists it, and refreshes representative system copy after remount", () => {
    mockSystemLanguage("en-US");
    const firstRender = renderDesktopApp();

    fireEvent.change(getLanguageSelect(), { target: { value: "zh-CN" } });

    expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
    expect(screen.getByText("对象库")).toBeDefined();
    expect(screen.getByText("属性面板")).toBeDefined();
    expect(screen.getByText("播放控制")).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏对象库" })).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏属性面板" })).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏播放控制" })).toBeDefined();
    expect(screen.getByRole("button", { name: "显示轨迹" })).toBeDefined();
    expect(screen.getByRole("button", { name: "显示受力矢量" })).toBeDefined();
    expect(screen.getByRole("button", { name: "批注" })).toBeDefined();
    expect(screen.getByTestId("rigid-boundary-overlay").textContent).toContain(
      "刚体接触按实体边界计算",
    );
    expect(screen.getByText("版本 1.0.56")).toBeDefined();
    expect(readStoredValues().some((value) => value?.includes("zh-CN"))).toBe(true);

    firstRender.unmount();
    renderDesktopApp();

    expect(getLanguageSelect().value).toBe("zh-CN");
    expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
    expect(screen.getByText("版本 1.0.56")).toBeDefined();
  });
});
