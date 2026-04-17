import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorConstraint } from "../state/editorConstraints";
import {
  createInitialEditorState,
  type EditorSceneEntity,
} from "../state/editorStore";
import { createBoardAnchoredArcTrackConstraint } from "../state/createBoardAnchoredArcTrackConstraint";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { resolveArcTrackBodyPreview } from "./arcTrackBodyEntity";
import {
  authoredBallInMeters,
  authoredBoardInMeters,
  createAuthoredBlockEntity,
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
    id: "arc-preview",
    kind: "arc-track",
    label: "Arc preview",
    center: { x: 2.2, y: 3.24 },
    radius: 1.2,
    startAngleDegrees: 180,
    endAngleDegrees: 270,
    side: "inside",
    entryEndpoint: "start",
  };
}

function createAuthoredArcTrackEntity(
  overrides: Partial<Extract<EditorSceneEntity, { kind: "arc-track" }>> = {},
): Extract<EditorSceneEntity, { kind: "arc-track" }> {
  return {
    id: "arc-track-authored-1",
    kind: "arc-track",
    label: "Arc Track Authored 1",
    anchorEntityId: "board-1",
    anchorEntityKind: "board",
    anchorEndpoint: "start",
    center: { x: 4, y: 2 },
    entryEndpoint: "start",
    radius: 1,
    sweepAngleDegrees: 90,
    centralAngleDegrees: 90,
    rotationDegrees: 0,
    thickness: 0.18,
    ...overrides,
  };
}

function expectArcGuidePath(pathTestId: string) {
  const path = screen.getByTestId(pathTestId) as SVGPathElement;

  expect(path.getAttribute("d")).not.toBe("");
  expect(path.getAttribute("d")).not.toContain("Z");
  expect(path.getAttribute("fill")).toBe("none");
  expect(path.getAttribute("stroke-linecap")).toBe("round");
}

describe("WorkspaceCanvas arc-track overlays", () => {
  it("chooses the nearest board top-edge endpoint even when the drag is over the board span", () => {
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
    expect(preview.tangentGuide?.start.y).toBeCloseTo(authoredBoardInMeters.y, 6);
  });

  it("snaps arc-track previews to locked block top-edge endpoints", () => {
    const block = createAuthoredBlockEntity({
      id: "block-2",
      locked: true,
      x: 2.12,
      y: 2.36,
    });
    const preview = resolveArcTrackBodyPreview({
      entities: [block],
      position: {
        x: block.x + 0.28,
        y: block.y + block.height / 2,
      },
    });

    expect(preview.status).toBe("snap");
    expect(preview.contactWithEntityId).toBe("block-2");
    expect(preview.tangentGuide?.start.x).toBeCloseTo(block.x, 6);
    expect(preview.tangentGuide?.start.y).toBeCloseTo(block.y, 6);
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

  it("renders committed arc-track entities as stroked guide lines", () => {
    const arcTrack = createAuthoredArcTrackEntity();

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [arcTrack],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[arcTrack]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          selectedEntityId: arcTrack.id,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.getByTestId(`scene-entity-${arcTrack.id}`).getAttribute("data-arc-track")).toBe("true");
    expectArcGuidePath(`scene-entity-${arcTrack.id}-path`);
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
    const block = createAuthoredBlockEntity({ locked: true });
    const selectedPresetDegrees: number[] = [];

    render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: block.id,
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
          editorEntities: [block],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[block]}
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

    expect(screen.getByTestId(`scene-constraint-arc-endpoint-start-${block.id}`)).toBeDefined();
    expect(screen.getByTestId("workspace-arc-track-span-preset-90")).toBeDefined();
    expect(
      screen.getByTestId("workspace-arc-track-span-preset-180").getAttribute("data-selected"),
    ).toBe("true");
    expect(screen.getByTestId("workspace-arc-track-span-preset-270")).toBeDefined();

    fireEvent.click(screen.getByTestId("workspace-arc-track-span-preset-270"));

    expect(selectedPresetDegrees).toEqual([270]);
  });

  it("renders tangent-continuous preview guides during arc-track creation", () => {
    const block = createAuthoredBlockEntity({ locked: true });

    render(
      <WorkspaceCanvas
        constraintPlacement={{
          anchorEntityId: block.id,
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
          editorEntities: [block],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[block]}
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
    expectArcGuidePath("workspace-arc-track-preview-path");
    expect(screen.getByTestId("workspace-arc-track-preview-radius-guide")).toBeDefined();
    expect(screen.getByTestId("workspace-arc-track-preview-tangent-guide")).toBeDefined();
  });

  it("hides anchored arc-track junction debug facts by default in normal editor selection", () => {
    const board = {
      ...authoredBoardInMeters,
      id: "board-tilted-1",
      locked: true,
      rotationDegrees: 30,
      width: 4,
      height: 1,
      x: 8,
      y: 4,
    } as Extract<EditorSceneEntity, { kind: "board" }>;
    const arcTrack = createAuthoredArcTrackEntity({
      id: "arc-track-tilted-1",
      label: "Tilted Arc Track 1",
      anchorEntityId: board.id,
      anchorEntityKind: "board",
      anchorEndpoint: "start",
      center: { x: 8.017949, y: 3.933012 },
      entryEndpoint: "start",
      radius: 1,
      sweepAngleDegrees: 90,
      centralAngleDegrees: 90,
      rotationDegrees: 105,
    });

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [board, arcTrack],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[board, arcTrack]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          selectedEntityId: arcTrack.id,
        }}
        viewport={meterViewport}
      />,
    );

    expect(screen.queryByTestId("workspace-selected-arc-track-junction-debug")).toBeNull();
  });

  it("publishes selected anchored arc-track junction facts from board guide geometry and entry tangent truth when debug is enabled", () => {
    const board = {
      ...authoredBoardInMeters,
      id: "board-tilted-1",
      locked: true,
      rotationDegrees: 30,
      width: 4,
      height: 1,
      x: 8,
      y: 4,
    } as Extract<EditorSceneEntity, { kind: "board" }>;
    const arcTrack = createAuthoredArcTrackEntity({
      id: "arc-track-tilted-1",
      label: "Tilted Arc Track 1",
      anchorEntityId: board.id,
      anchorEntityKind: "board",
      anchorEndpoint: "start",
      center: { x: 8.017949, y: 3.933012 },
      entryEndpoint: "start",
      radius: 1,
      sweepAngleDegrees: 90,
      centralAngleDegrees: 90,
      rotationDegrees: 105,
    });

    render(
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: [board, arcTrack],
          runtimeFrame: null,
          viewport: meterViewport,
        })}
        entities={[board, arcTrack]}
        onCreateEntity={() => undefined}
        onMoveEntity={() => undefined}
        onGridVisibleChange={() => undefined}
        onSelectEntity={() => undefined}
        showArcTrackJunctionDebug
        onToolChange={() => undefined}
        state={{
          ...createInitialEditorState(),
          selectedEntityId: arcTrack.id,
        }}
        viewport={meterViewport}
      />,
    );

    const debugSurface = screen.getByTestId("workspace-selected-arc-track-junction-debug");

    expect(debugSurface.getAttribute("data-anchor-entity")).toBe("board:board-tilted-1");
    expect(debugSurface.getAttribute("data-anchor-endpoint")).toBe("start");
    expect(debugSurface.getAttribute("data-entry-endpoint")).toBe("start");
    expect(debugSurface.getAttribute("data-junction-aligned")).toBe("true");
    expect(debugSurface.getAttribute("data-position-error")).toBe("0");
    expect(debugSurface.getAttribute("data-tangent-dot")).toBe("1");
    expect(screen.getByTestId("workspace-selected-arc-track-junction-anchor-point").textContent).toContain(
      "8.517949, 3.066987",
    );
    expect(
      screen.getByTestId("workspace-selected-arc-track-junction-entry-point").textContent,
    ).toContain("8.517949, 3.066987");
    expect(
      screen.getByTestId("workspace-selected-arc-track-junction-anchor-tangent").textContent,
    ).toContain("-0.866025, -0.5");
    expect(
      screen.getByTestId("workspace-selected-arc-track-junction-entry-tangent").textContent,
    ).toContain("-0.866025, -0.5");
    expect(
      screen.getByTestId("workspace-selected-arc-track-junction-guide-normal").textContent,
    ).toContain("0.5, -0.866025");
  });
});
