import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

function setNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
}

describe("App language switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setNavigatorLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("defaults shell chrome to simplified chinese for zh navigator locales", () => {
    setNavigatorLanguage("zh-TW");

    render(<App />);

    expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
    expect(screen.getByLabelText("语言")).toBeDefined();
    expect(screen.getByText("版本 1.0.15")).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏对象库" })).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏属性面板" })).toBeDefined();
    expect(screen.getByRole("button", { name: "隐藏播放控制" })).toBeDefined();
  });

  it("persists manual language changes and keeps the selector to the right of reset layout", () => {
    const { unmount } = render(<App />);

    const resetButton = screen.getByRole("button", { name: "Reset layout" });
    const languageSelect = screen.getByLabelText("Language");

    expect(resetButton.compareDocumentPosition(languageSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Version 1.0.15")).toBeDefined();

    fireEvent.change(languageSelect, {
      target: { value: "zh-CN" },
    });

    expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
    expect((screen.getByLabelText("语言") as HTMLSelectElement).value).toBe("zh-CN");
    expect(screen.getByText("版本 1.0.15")).toBeDefined();
    expect(window.localStorage.getItem("physics-sandbox:locale")).toBe("zh-CN");

    unmount();
    render(<App />);

    expect(screen.getByRole("button", { name: "重置布局" })).toBeDefined();
    expect((screen.getByLabelText("语言") as HTMLSelectElement).value).toBe("zh-CN");
  });
});
