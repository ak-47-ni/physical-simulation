import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnnotationLayer, type AnnotationLayerState } from "./AnnotationLayer";

afterEach(() => {
  cleanup();
});

describe("AnnotationLayer", () => {
  it("enters ink mode, draws black strokes by default, switches color, and exits", () => {
    render(<AnnotationLayer />);

    const colorPicker = screen.getByLabelText(/ink color/i);

    expect(screen.queryByRole("button", { name: /black ink/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /blue ink/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /red ink/i })).toBeNull();
    expect((colorPicker as HTMLInputElement).value).toBe("#000000");
    expect(screen.getByTestId("annotation-layer").getAttribute("data-active")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-active")).toBe("true");

    const surface = screen.getByTestId("annotation-layer-surface");
    expect(surface.style.cursor).toContain("crosshair");

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 12 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 24 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 24 });

    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();
    expect(screen.getByTestId("annotation-stroke-0").getAttribute("data-color")).toBe("#000000");

    fireEvent.change(colorPicker, { target: { value: "#2563eb" } });

    fireEvent.pointerDown(surface, { clientX: 40, clientY: 48 });
    fireEvent.pointerMove(surface, { clientX: 64, clientY: 72 });
    fireEvent.pointerUp(surface, { clientX: 64, clientY: 72 });

    expect(screen.getByTestId("annotation-stroke-1").getAttribute("data-color")).toBe("#2563eb");

    fireEvent.contextMenu(surface);

    expect(screen.queryByTestId("annotation-stroke-1")).toBeNull();
    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /cancel ink/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-active")).toBe("false");
    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();
  });

  it("exits ink mode on escape", () => {
    render(<AnnotationLayer />);

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-active")).toBe("true");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByTestId("annotation-layer").getAttribute("data-active")).toBe("false");
  });

  it("erases only the hit segment of an annotation stroke", () => {
    let currentState: AnnotationLayerState = {
      active: false,
      activeColor: "#000000",
      tool: "ink",
      visible: true,
      strokes: [
        {
          id: "stroke-1",
          color: "#000000",
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 50, y: 10 },
            { x: 70, y: 10 },
            { x: 90, y: 10 },
          ],
        },
      ],
    };
    let rerenderLayer: ReturnType<typeof render>["rerender"] | null = null;
    const renderLayer = () => (
      <AnnotationLayer
        state={currentState}
        onStateChange={(nextState) => {
          currentState = nextState;
          rerenderLayer?.(renderLayer());
        }}
      />
    );

    const { rerender } = render(renderLayer());
    rerenderLayer = rerender;

    fireEvent.click(screen.getByRole("button", { name: /eraser/i }));
    expect(screen.getByTestId("annotation-layer").getAttribute("data-tool")).toBe("eraser");

    const surface = screen.getByTestId("annotation-layer-surface");
    fireEvent(surface, new MouseEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 10 }));

    expect(screen.getByTestId("annotation-stroke-0").getAttribute("points")).toBe("10,10 30,10");
    expect(screen.getByTestId("annotation-stroke-1").getAttribute("points")).toBe("70,10 90,10");
  });

  it("supports controlled annotation state updates", () => {
    const nextStates: Array<{
      strokes: Array<{ id: string; points: Array<{ x: number; y: number }>; color: string }>;
      visible: boolean;
      activeColor: string;
      active: boolean;
      tool: "ink" | "eraser";
    }> = [];

    const { rerender } = render(
      <AnnotationLayer
        state={{
          strokes: [],
          visible: true,
          activeColor: "#000000",
          active: false,
          tool: "ink",
        }}
        onStateChange={(nextState) => {
          nextStates.push(nextState);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));

    expect(nextStates.at(-1)?.active).toBe(true);

    fireEvent.change(screen.getByLabelText(/ink color/i), { target: { value: "#2563eb" } });

    expect(nextStates.at(-1)?.activeColor).toBe("#2563eb");

    rerender(
      <AnnotationLayer
        state={{
          strokes: [],
          visible: true,
          activeColor: "#2563eb",
          active: true,
          tool: "ink",
        }}
        onStateChange={(nextState) => {
          nextStates.push(nextState);
        }}
      />,
    );

    const surface = screen.getByTestId("annotation-layer-surface");

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 12 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 24 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 24 });

    expect(nextStates.at(-1)?.strokes).toHaveLength(1);
    expect(nextStates.at(-1)?.strokes[0]?.color).toBe("#2563eb");

    rerender(
      <AnnotationLayer
        state={{
          strokes: nextStates.at(-1)?.strokes ?? [],
          visible: true,
          activeColor: "#2563eb",
          active: true,
          tool: "ink",
        }}
        onStateChange={(nextState) => {
          nextStates.push(nextState);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel ink/i }));

    expect(nextStates.at(-1)?.active).toBe(false);
  });
});
