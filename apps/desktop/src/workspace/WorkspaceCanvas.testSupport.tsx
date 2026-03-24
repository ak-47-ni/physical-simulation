import { useState } from "react";

import { createSceneDisplaySettings } from "../io/sceneFile";
import {
  createInitialEditorState,
  type EditorSceneEntity,
} from "../state/editorStore";
import type { LibraryDragSession } from "./libraryDragSession";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { projectRuntimeSceneEntities } from "./runtimeSceneView";
import type { UnitViewport } from "./unitViewport";

export function createDisplaySettings(
  overrides: Parameters<typeof createSceneDisplaySettings>[0] = {},
) {
  return createSceneDisplaySettings({
    gridVisible: true,
    showLabels: true,
    showTrajectories: false,
    showForceVectors: false,
    showVelocityVectors: false,
    ...overrides,
  });
}

export const meterViewport: UnitViewport = {
  lengthUnit: "m",
  pixelsPerMeter: 100,
};

export type WorkspaceCanvasLibraryDragHover = {
  authoringPosition: { x: number; y: number } | null;
  isOverStage: boolean;
};

export const authoredBallInMeters: EditorSceneEntity = {
  id: "ball-1",
  kind: "ball",
  label: "Ball 1",
  x: 1.2,
  y: 1.8,
  radius: 0.24,
  mass: 1,
  friction: 0.12,
  restitution: 0.82,
  locked: false,
  velocityX: 0,
  velocityY: 0,
};

export function WorkspaceCanvasPanHarness(props: {
  libraryDragSession?: LibraryDragSession | null;
  entities?: EditorSceneEntity[];
  onLibraryDragHoverChange?: (hover: WorkspaceCanvasLibraryDragHover | null) => void;
  onMoveEntity?: (id: string, position: { x: number; y: number }) => void;
  initialViewport?: UnitViewport & { offsetPx?: { x: number; y: number } };
  state?: ReturnType<typeof createInitialEditorState>;
}) {
  const [viewport, setViewport] = useState<UnitViewport & { offsetPx?: { x: number; y: number } }>(
    props.initialViewport ?? {
      ...meterViewport,
      offsetPx: { x: 0, y: 0 },
    },
  );
  const entities = props.entities ?? [authoredBallInMeters];

  return (
    <>
      <output data-testid="viewport-offset-readout">
        {`${viewport.offsetPx?.x ?? 0},${viewport.offsetPx?.y ?? 0}`}
      </output>
      <WorkspaceCanvas
        display={createDisplaySettings()}
        displayEntities={projectRuntimeSceneEntities({
          editorEntities: entities,
          runtimeFrame: null,
          viewport,
        })}
        entities={entities}
        onCreateEntity={() => undefined}
        onMoveEntity={props.onMoveEntity ?? (() => undefined)}
        state={props.state ?? createInitialEditorState()}
        viewport={viewport}
        libraryDragSession={props.libraryDragSession ?? null}
        onLibraryDragHoverChange={props.onLibraryDragHoverChange}
        onGridVisibleChange={() => undefined}
        onViewportOffsetChange={(offsetPx) => {
          setViewport((current) => ({
            ...current,
            offsetPx,
          }));
        }}
        onSelectEntity={() => undefined}
        onToolChange={() => undefined}
      />
    </>
  );
}
