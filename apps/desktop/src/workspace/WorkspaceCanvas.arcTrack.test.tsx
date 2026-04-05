import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorConstraint } from "../state/editorConstraints";
import { createInitialEditorState } from "../state/editorStore";
import { createBoardAnchoredArcTrackConstraint } from "../state/createBoardAnchoredArcTrackConstraint";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import {
  createArcTrackProfileGeometry,
  createArcTrackTemplate,
  resolveArcTrackBodyPreview,
} from "./arcTrackBodyEntity";
import {
  authoredBoardInMeters,
  authoredBallInMeters,
  createDisplaySettings,
  meterViewport,
} from "./WorkspaceCanvas.testSupport";
import { projectRuntimeSceneEntities } from "./runtimeSceneView";

afterEach(() => {
  cleanup();
});

function createArcTrackConstraint(): EditorConstraint {
  return {
    ...createBoardAnchoredArcTrackConstraint({
      board: {
        ...authoredBoardInMeters,
        locked: true,
      },
      center: { x: 1.2, y: 2.04 },
      endpointKey: "start",
      id: "arc-track-1",
    }),
    label: "Arc track 1",
  };
}

function createArcTrackPreviewConstraint(): Extract<EditorConstraint, { kind: "arc-track" }> {
  return {
    ...createArcTrackConstraint(),
    label: "Arc preview",
  };
}

describe("WorkspaceCanvas arc-track overlays", () => {
  it("uses the standardized 0.18 m default thickness for arc-track body previews", () => {
    const freeTemplate = createArcTrackTemplate({ x: 2.4, y: 1.8 });
    const snappedPreview = resolveArcTrackBodyPreview({
      entities: [{ ...authoredBoardInMeters, locked: true }],
      position: { x: authoredBoardInMeters.x, y: authoredBoardInMeters.y + 0.12 },
    });

    expect(freeTemplate.thickness).toBeCloseTo(0.18);
    expect(snappedPreview.entity.thickness).toBeCloseTo(0.18);
  });

  it("chooses the nearest board endpoint even when the drag is over the board span", () => {
    const preview = resolveArcTrackBodyPreview({
      entities: [{ ...authoredBoardInMeters, locked: true }],
      position: {
        x: authoredBoardInMeters.x + 0.6,
        y: authoredBoardInMeters.y + authoredBoardInMeters.height / 2,
      },
    });

    expect(preview.status).toBe("snap");
    expect(preview.contactWithEntityId).toBe("board-1");
    expect(preview.tangentGuide?.start.x).toBeCloseTo(authoredBoardInMeters.x, 6);
    expect(preview.tangentGuide?.start.y).toBeCloseTo(
      authoredBoardInMeters.y + authoredBoardInMeters.height / 2,
      6,
    );
  });

  it("builds arc-track profile geometry with radial start and end faces", () => {
    const geometry = createArcTrackProfileGeometry({
      center: { x: 400, y: 220 },
      centralAngleDegrees: 90,
      friction: 0.42,
      id: "arc-track-geometry",
      kind: "arc-track",
      label: "Arc Track Geometry",
      locked: false,
      mass: 5,
      radius: 96,
      restitution: 1,
      rotationDegrees: 0,
      thickness: 24,
      velocityX: 0,
      velocityY: 0,
    });
    const startCross =
      (geometry.outerStartPoint.x - geometry.center.x) *
        (geometry.innerStartPoint.y - geometry.center.y) -
      (geometry.outerStartPoint.y - geometry.center.y) *
        (geometry.innerStartPoint.x - geometry.center.x);
    const endCross =
      (geometry.outerEndPoint.x - geometry.center.x) *
        (geometry.innerEndPoint.y - geometry.center.y) -
      (geometry.outerEndPoint.y - geometry.center.y) *
        (geometry.innerEndPoint.x - geometry.center.x);

    expect(Math.abs(startCross)).toBeLessThan(0.001);
    expect(Math.abs(endCross)).toBeLessThan(0.001);
    expect(geometry.pathData).toContain("Z");
  });

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

  it("renders free-entry arc-track overlays even when the source board is absent", () => {
    render(
      <WorkspaceCanvas
        constraints={[createArcTrackConstraint()]}
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={createInitialEditorState()}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("scene-constraint-arc-track-arc-track-1")).toBeDefined();
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

  it("shows a live quantized radius readout during arc-track radius picking", () => {
    const board = { ...authoredBoardInMeters, locked: true };
    const projectedBoard = projectRuntimeSceneEntities({
      editorEntities: [board],
      runtimeFrame: null,
      viewport: meterViewport,
    });
    const { rerender } = render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: board.id,
          boardEndpointKey: "start",
          hint: "Drag out the arc radius",
          kind: "arc-track",
          mode: "pick-radius",
          previewConstraint: createArcTrackPreviewConstraint(),
          radiusLabel: "1.2 m",
        }}
        display={createDisplaySettings()}
        displayEntities={projectedBoard}
        entities={[board]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("workspace-arc-track-radius-readout").textContent).toContain(
      "1.2 m",
    );

    rerender(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: board.id,
          boardEndpointKey: "start",
          hint: "Drag out the arc radius",
          kind: "arc-track",
          mode: "pick-radius",
          previewConstraint: createArcTrackPreviewConstraint(),
          radiusLabel: "1.3 m",
        }}
        display={createDisplaySettings()}
        displayEntities={projectedBoard}
        entities={[board]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("workspace-arc-track-radius-readout").textContent).toContain(
      "1.3 m",
    );
    expect(screen.queryByText("1.2 m")).toBeNull();
  });

  it("shows span preset buttons and reports the selected preset during arc-track creation", () => {
    const board = { ...authoredBoardInMeters, locked: true };
    const selectedPresetDegrees: number[] = [];

    render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: board.id,
          boardEndpointKey: "start",
          hint: "Choose the arc span",
          kind: "arc-track",
          mode: "pick-span",
          previewConstraint: createArcTrackPreviewConstraint(),
          radiusLabel: "1.2 m",
          selectedSpanDegrees: 180,
          spanPresetOptions: [90, 180, 270],
        }}
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [board],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[board]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onSelectArcTrackSpanPreset={(spanDegrees) => {
          selectedPresetDegrees.push(spanDegrees);
        }}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("workspace-arc-track-span-preset-90")).toBeDefined();
    expect(
      screen.getByTestId("workspace-arc-track-span-preset-180").getAttribute("data-selected"),
    ).toBe("true");
    expect(screen.getByTestId("workspace-arc-track-span-preset-270")).toBeDefined();

    fireEvent.click(screen.getByTestId("workspace-arc-track-span-preset-270"));

    expect(selectedPresetDegrees).toEqual([270]);
  });

  it("renders tangent-continuous preview guides during arc-track creation", () => {
    const board = { ...authoredBoardInMeters, locked: true };

    render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: board.id,
          boardEndpointKey: "start",
          hint: "Choose the arc span",
          kind: "arc-track",
          mode: "pick-span",
          previewConstraint: createArcTrackPreviewConstraint(),
          radiusLabel: "1.2 m",
          selectedSpanDegrees: 90,
          spanPresetOptions: [90, 180, 270],
        }}
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [board],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[board]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          activeTool: "place-constraint" as never,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId("workspace-arc-track-preview")).toBeDefined();
    const previewPath = screen.getByTestId("workspace-arc-track-preview-path") as SVGPathElement;

    expect(previewPath.getAttribute("d")).toContain("Z");
    expect(previewPath.getAttribute("fill")).not.toBe("none");
    expect(previewPath.getAttribute("stroke-linejoin")).toBe("miter");
    expect(screen.getByTestId("workspace-arc-track-preview-radius-guide")).toBeDefined();
    expect(screen.getByTestId("workspace-arc-track-preview-tangent-guide")).toBeDefined();
  });
});
