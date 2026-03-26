import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  authoredBoardInMeters,
  createAuthoredBlockEntity,
  meterViewport,
  WorkspaceCanvasPanHarness,
} from "./WorkspaceCanvas.testSupport";

afterEach(() => {
  cleanup();
});

describe("WorkspaceCanvas quadrant domain", () => {
  it("renders visible x=0 and y=0 axes and differentiates the invalid region", () => {
    render(
      <WorkspaceCanvasPanHarness
        initialViewport={{
          ...meterViewport,
          offsetPx: { x: 32, y: 24 },
        }}
      />,
    );

    expect((screen.getByTestId("workspace-domain-axis-y") as HTMLElement).style.left).toBe("32px");
    expect((screen.getByTestId("workspace-domain-axis-x") as HTMLElement).style.top).toBe("24px");
    expect((screen.getByTestId("workspace-domain-invalid-left") as HTMLElement).style.width).toBe(
      "32px",
    );
    expect((screen.getByTestId("workspace-domain-invalid-top") as HTMLElement).style.height).toBe(
      "24px",
    );
  });

  it("keeps an out-of-bounds blocked preview stable near the first-quadrant boundary", () => {
    render(
      <WorkspaceCanvasPanHarness
        authoringPlacementPreview={{
          entity: createAuthoredBlockEntity({
            x: -0.18,
            y: 0.08,
          }),
          status: "blocked",
        }}
        entities={[authoredBoardInMeters]}
        initialViewport={{
          ...meterViewport,
          offsetPx: { x: 32, y: 24 },
        }}
      />,
    );

    const preview = screen.getByTestId("workspace-stage-body-preview") as HTMLElement;

    expect(preview.getAttribute("data-preview-status")).toBe("blocked");
    expect(preview.getAttribute("data-placement-valid")).toBe("false");
    expect(preview.style.left).toBe("14px");
    expect(preview.style.top).toBe("32px");
    expect(preview.style.width).toBe("84px");
    expect(preview.style.height).toBe("52px");
  });
});
