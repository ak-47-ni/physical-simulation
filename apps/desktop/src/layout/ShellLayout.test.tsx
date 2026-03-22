import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../App";

afterEach(() => {
  cleanup();
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
});
