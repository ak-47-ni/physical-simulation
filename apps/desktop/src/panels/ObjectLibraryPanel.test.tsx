import type { ComponentType } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ObjectLibraryPanel } from "./ObjectLibraryPanel";

afterEach(() => {
  cleanup();
});

const DragAwareObjectLibraryPanel = ObjectLibraryPanel as ComponentType<Record<string, unknown>>;

describe("ObjectLibraryPanel", () => {
  it("starts a body drag with the body kind and pointer coordinates", () => {
    const selections: string[] = [];
    const drags: Array<{
      bodyKind: string;
      pointerClientPx: {
        x: number;
        y: number;
      };
    }> = [];

    render(
      <DragAwareObjectLibraryPanel
        onSelectItem={(itemId: string) => {
          selections.push(itemId);
        }}
        onStartBodyDrag={(session: {
          bodyKind: string;
          pointerClientPx: { x: number; y: number };
        }) => {
          drags.push(session);
        }}
        selectedItemId="spring"
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Board" }), {
      button: 0,
      clientX: 280,
      clientY: 236,
    });

    expect(drags).toEqual([
      {
        bodyKind: "board",
        pointerClientPx: {
          x: 280,
          y: 236,
        },
      },
    ]);
    expect(selections).toEqual([]);
  });

  it("does not keep persistent selected styling on body drag sources", () => {
    render(
      <DragAwareObjectLibraryPanel
        onSelectItem={() => undefined}
        onStartBodyDrag={() => undefined}
        selectedItemId="ball"
      />,
    );

    expect(screen.getByTestId("library-item-ball").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("library-item-block").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("library-item-board").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("library-item-polygon").getAttribute("data-selected")).toBe("false");
  });

  it("keeps spring, track, and arc-track on the existing selection callback path", () => {
    const selections: string[] = [];
    const { rerender } = render(
      <DragAwareObjectLibraryPanel
        onSelectItem={(itemId: string) => {
          selections.push(itemId);
        }}
        onStartBodyDrag={() => undefined}
        selectedItemId="ball"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Spring" }));

    rerender(
      <DragAwareObjectLibraryPanel
        onSelectItem={(itemId: string) => {
          selections.push(itemId);
        }}
        onStartBodyDrag={() => undefined}
        selectedItemId="spring"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    rerender(
      <DragAwareObjectLibraryPanel
        onSelectItem={(itemId: string) => {
          selections.push(itemId);
        }}
        onStartBodyDrag={() => undefined}
        selectedItemId="track"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Arc track" }));

    rerender(
      <DragAwareObjectLibraryPanel
        onSelectItem={(itemId: string) => {
          selections.push(itemId);
        }}
        onStartBodyDrag={() => undefined}
        selectedItemId="arc-track"
      />,
    );

    expect(selections).toEqual(["spring", "track", "arc-track"]);
    expect(screen.getByTestId("library-item-spring").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("library-item-track").getAttribute("data-selected")).toBe("false");
    expect(screen.getByTestId("library-item-arc-track").getAttribute("data-selected")).toBe("true");
  });
});
