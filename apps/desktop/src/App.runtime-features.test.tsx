import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

afterEach(() => {
  cleanup();
});

describe("App runtime features", () => {
  it("mounts the transport bar, analysis panel, and annotation layer into the desktop shell", () => {
    render(<App />);

    expect(screen.getByTestId("bottom-transport-bar")).toBeDefined();
    expect(screen.getByTestId("analysis-panel")).toBeDefined();
    expect(screen.getByTestId("annotation-layer")).toBeDefined();
  });
});
