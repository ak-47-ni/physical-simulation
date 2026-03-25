import { useState } from "react";

import { createSceneDisplaySettings } from "../io/sceneFile";
import type { EditorConstraint } from "../state/editorConstraints";
import {
  createInitialEditorState,
  type EditorSceneEntity,
} from "../state/editorStore";
import type { LibraryDragSession } from "./libraryDragSession";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import {
  projectRuntimeSceneEntities,
  type WorkspaceSceneEntity,
} from "./runtimeSceneView";
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

export function createBallEntityPx(
  overrides: Partial<Extract<WorkspaceSceneEntity, { kind: "ball" }>> = {},
): WorkspaceSceneEntity {
  return {
    id: "ball-1",
    kind: "ball",
    label: "Ball 1",
    x: 120,
    y: 180,
    radius: 24,
    mass: 1,
    friction: 0.12,
    restitution: 0.82,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

export function createBlockEntityPx(
  overrides: Partial<Extract<WorkspaceSceneEntity, { kind: "block" }>> = {},
): WorkspaceSceneEntity {
  return {
    id: "block-1",
    kind: "block",
    label: "Block 1",
    x: 212,
    y: 236,
    width: 84,
    height: 52,
    mass: 2.8,
    friction: 0.36,
    restitution: 0.24,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

export function createBoardEntityPx(
  overrides: Partial<Extract<WorkspaceSceneEntity, { kind: "board" }>> = {},
): WorkspaceSceneEntity {
  return {
    id: "board-1",
    kind: "board",
    label: "Board 1",
    x: 320,
    y: 260,
    width: 148,
    height: 24,
    mass: 5,
    friction: 0.42,
    restitution: 0.18,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

export function createPolygonEntityPx(
  overrides: Partial<Extract<WorkspaceSceneEntity, { kind: "polygon" }>> = {},
): WorkspaceSceneEntity {
  return {
    id: "polygon-1",
    kind: "polygon",
    label: "Polygon 1",
    x: 460,
    y: 188,
    width: 76,
    height: 76,
    mass: 2.2,
    friction: 0.28,
    restitution: 0.22,
    locked: false,
    velocityX: 0,
    velocityY: 0,
    ...overrides,
  };
}

export function createSpringConstraint(
  overrides: Partial<Extract<EditorConstraint, { kind: "spring" }>> = {},
): EditorConstraint {
  return {
    id: "spring-1",
    kind: "spring",
    entityAId: "ball-1",
    entityBId: "board-1",
    restLength: 236,
    stiffness: 32,
    ...overrides,
  };
}

export function createTrackConstraint(
  overrides: Partial<Extract<EditorConstraint, { kind: "track" }>> = {},
): EditorConstraint {
  return {
    id: "track-1",
    kind: "track",
    entityId: "ball-1",
    origin: { x: 1.44, y: 2.04 },
    axis: { x: 1.68, y: 0.44 },
    ...overrides,
  };
}

export function WorkspaceCanvasPanHarness(props: {
  libraryDragSession?: LibraryDragSession | null;
  entities?: WorkspaceSceneEntity[];
  onLibraryDragHoverChange?: (hover: WorkspaceCanvasLibraryDragHover | null) => void;
  onMoveEntity?: (id: string, position: { x: number; y: number }) => void;
  onSelectConstraint?: (constraintId: string) => void;
  initialViewport?: UnitViewport & { offsetPx?: { x: number; y: number } };
  selectedRuntimeVelocityVector?: {
    entityId: string;
    velocityX: number;
    velocityY: number;
  } | null;
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
        onSelectConstraint={props.onSelectConstraint}
        state={props.state ?? createInitialEditorState()}
        selectedRuntimeVelocityVector={props.selectedRuntimeVelocityVector ?? null}
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
