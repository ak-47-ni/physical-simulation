import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorConstraint } from "../state/editorConstraints";
import { createInitialEditorState } from "../state/editorStore";
import { createArcTrackConstraintFromBallAndCenter } from "../state/createArcTrackConstraint";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import {
  authoredBallInMeters,
  createDisplaySettings,
  meterViewport,
} from "./WorkspaceCanvas.testSupport";
import { projectRuntimeSceneEntities } from "./runtimeSceneView";

afterEach(() => {
  cleanup();
});

function createArcTrackConstraint(): EditorConstraint {
  return createArcTrackConstraintFromBallAndCenter({
    ball: authoredBallInMeters,
    center: { x: 1.2, y: 2.04 },
    id: "arc-track-1",
  }) as unknown as EditorConstraint;
}

describe("WorkspaceCanvas arc-track overlays", () => {
  it("renders a curved arc-track overlay from authored arc data", () => {
    render(
      <WorkspaceCanvas
        constraints={[createArcTrackConstraint()]}
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [authoredBallInMeters],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[authoredBallInMeters]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          selectedConstraintId: "arc-track-1",
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("scene-constraint-arc-track-arc-track-1").getAttribute("data-selected")).toBe(
      "true",
    );
    expect(
      (screen.getByTestId("scene-constraint-arc-track-arc-track-1-path") as SVGPathElement).getAttribute(
        "d",
      ),
    ).not.toBe("");
  });

  it("selects a curved arc-track overlay without selecting the ball", () => {
    const selectedConstraintIds: string[] = [];
    const selectedEntityIds: string[] = [];

    render(
      <WorkspaceCanvas
        constraints={[createArcTrackConstraint()]}
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [authoredBallInMeters],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[authoredBallInMeters]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectConstraint={(constraintId) => {
          selectedConstraintIds.push(constraintId);
        }}
        onSelectEntity={(entityId) => {
          selectedEntityIds.push(entityId);
        }}
        onToolChange={() => undefined}
        state={createInitialEditorState()}
        viewport={meterViewport}
      />,
    );

    fireEvent.click(screen.getByTestId("scene-constraint-arc-track-arc-track-1"));

    expect(selectedConstraintIds).toEqual(["arc-track-1"]);
    expect(selectedEntityIds).toEqual([]);
  });
});
