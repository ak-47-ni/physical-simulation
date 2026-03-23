import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ShellLayout", () => {
  it("renders the four primary shell regions", () => {
    render(<App />);

    expect(screen.getByTestId("shell-left-pane")).toBeDefined();
    expect(screen.getByTestId("shell-center-pane")).toBeDefined();
    expect(screen.getByTestId("shell-right-pane")).toBeDefined();
    expect(screen.getByTestId("shell-bottom-pane")).toBeDefined();
  });

  it("collapses left, right, and bottom panes independently", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /hide library/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide inspector/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide transport/i }));

    expect(screen.getByTestId("shell-left-pane").getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByTestId("shell-bottom-pane").getAttribute("data-collapsed")).toBe("true");
  });

  it("resizes left, right, and bottom panes through drag handles", () => {
    render(<App />);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-left"), { clientX: 280 });
    fireEvent.mouseMove(window, { clientX: 332 });
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-right"), { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: 860 });
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-bottom"), { clientY: 700 });
    fireEvent.mouseMove(window, { clientY: 664 });
    fireEvent.mouseUp(window);

    expect(screen.getByTestId("shell-left-pane").getAttribute("data-size")).toBe("332");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-size")).toBe("360");
    expect(screen.getByTestId("shell-bottom-pane").getAttribute("data-size")).toBe("168");
  });

  it("releases workspace space when panes are collapsed", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /hide library/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide inspector/i }));
    fireEvent.click(screen.getByRole("button", { name: /hide transport/i }));

    expect(screen.getByTestId("shell-left-pane").getAttribute("data-collapsed-size")).toBe("72");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-collapsed-size")).toBe("72");
    expect(screen.getByTestId("shell-bottom-pane").getAttribute("data-collapsed-size")).toBe("56");
  });

  it("restores pane sizes and collapsed state after remount", () => {
    const firstRender = render(<App />);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-left"), { clientX: 280 });
    fireEvent.mouseMove(window, { clientX: 348 });
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-bottom"), { clientY: 700 });
    fireEvent.mouseMove(window, { clientY: 650 });
    fireEvent.mouseUp(window);

    fireEvent.click(screen.getByRole("button", { name: /hide inspector/i }));

    firstRender.unmount();

    render(<App />);

    expect(screen.getByTestId("shell-left-pane").getAttribute("data-size")).toBe("348");
    expect(screen.getByTestId("shell-bottom-pane").getAttribute("data-size")).toBe("182");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-collapsed")).toBe("true");
  });

  it("resets pane layout back to defaults", () => {
    render(<App />);

    fireEvent.mouseDown(screen.getByTestId("shell-resize-left"), { clientX: 280 });
    fireEvent.mouseMove(window, { clientX: 348 });
    fireEvent.mouseUp(window);

    fireEvent.click(screen.getByRole("button", { name: /hide inspector/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset layout/i }));

    expect(screen.getByTestId("shell-left-pane").getAttribute("data-size")).toBe("280");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-size")).toBe("320");
    expect(screen.getByTestId("shell-right-pane").getAttribute("data-collapsed")).toBe("false");
  });
});
