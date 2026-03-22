import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ObjectLibraryPanel } from "./ObjectLibraryPanel";

afterEach(() => {
  cleanup();
});

describe("ObjectLibraryPanel", () => {
  it("selects a library item and exposes selected state", () => {
    const selections: string[] = [];

    render(
      <ObjectLibraryPanel
        onSelectItem={(itemId) => {
          selections.push(itemId);
        }}
        selectedItemId="ball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Board" }));

    expect(selections).toEqual(["board"]);
    expect(screen.getByTestId("library-item-ball").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("library-item-board").getAttribute("data-selected")).toBe("false");
  });
});
