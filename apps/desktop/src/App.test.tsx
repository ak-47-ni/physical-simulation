import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App selection sync", () => {
  it("synchronizes selection across scene tree, workspace, and property panel", () => {
    render(<App />);

    expect(screen.getByText("No entity selected")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Board 1" }));

    expect(screen.getByText("318, 272")).toBeDefined();
    expect(screen.getByTestId("scene-entity-board-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-tree-item-board-1").getAttribute("data-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));

    expect(screen.getByTestId("scene-entity-ball-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("scene-tree-item-ball-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("132, 176")).toBeDefined();
  });
});
