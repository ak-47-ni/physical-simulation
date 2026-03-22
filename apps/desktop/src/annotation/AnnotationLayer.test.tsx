import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnnotationLayer } from "./AnnotationLayer";

afterEach(() => {
  cleanup();
});

describe("AnnotationLayer", () => {
  it("draws strokes, switches color, erases, and toggles visibility", () => {
    render(<AnnotationLayer />);

    const surface = screen.getByTestId("annotation-layer-surface");

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 12 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 24 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 24 });

    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();
    expect(screen.getByTestId("annotation-stroke-0").getAttribute("data-color")).toBe("#111827");

    fireEvent.click(screen.getByRole("button", { name: /blue ink/i }));

    fireEvent.pointerDown(surface, { clientX: 40, clientY: 48 });
    fireEvent.pointerMove(surface, { clientX: 64, clientY: 72 });
    fireEvent.pointerUp(surface, { clientX: 64, clientY: 72 });

    expect(screen.getByTestId("annotation-stroke-1").getAttribute("data-color")).toBe("#2563eb");

    fireEvent.click(screen.getByRole("button", { name: /erase last stroke/i }));

    expect(screen.queryByTestId("annotation-stroke-1")).toBeNull();
    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /hide annotations/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-visible")).toBe("false");
    expect(screen.queryByTestId("annotation-stroke-0")).toBeNull();
  });
});
