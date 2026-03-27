import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

import type { SceneDisplaySettings } from "../io/sceneFile";
import type { EditorConstraint, LibraryConstraintKind } from "../state/editorConstraints";
import type { EditorSceneEntity } from "../state/editorStore";
import type { LibraryDragSession } from "./libraryDragSession";
import {
  isArcTrackConstraint,
  renderArcTrackConstraintOverlay,
} from "./arcTrackConstraintOverlay";
import {
  projectAuthoringEntityToScreen,
  type WorkspaceSceneEntity,
} from "./runtimeSceneView";
import { createSceneDomainOverlay } from "./sceneDomainOverlay";
import type { EditorTool } from "./tools";
import {
  createConstraintLineGeometry,
  createSpringOverlayGeometry,
} from "./constraintOverlayGeometry";
import { mapCartesianVelocityToScreenVector } from "./velocityVectorScreen";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  projectAuthoringPointToScreen,
  projectScreenPointToAuthoring,
  readViewportOffsetPx,
  type UnitViewport,
} from "./unitViewport";

type ConstraintPlacementState = {
  anchorEntityId: string | null;
  hint: string;
  kind: LibraryConstraintKind;
  mode: "pick-ball" | "pick-center" | "pick-entity" | "pick-point";
};

type WorkspaceCanvasProps = {
  authoringPlacementPreview?: WorkspaceCanvasAuthoringPlacementPreview;
  authoringLocked?: boolean;
  constraintPlacement?: ConstraintPlacementState | null;
  constraints?: EditorConstraint[];
  display: SceneDisplaySettings;
  displayEntities?: WorkspaceSceneEntity[];
  entities: WorkspaceSceneEntity[];
  libraryDragBlocked?: boolean;
  libraryDragSession?: LibraryDragSession | null;
  onCancelPlacement?: () => void;
  onCreateEntity: (position: { x: number; y: number }) => void;
  onLibraryDragHoverChange?: (hover: WorkspaceCanvasLibraryDragHover | null) => void;
  onPlaceConstraintEntity?: (entityId: string) => void;
  onPlaceConstraintPoint?: (position: { x: number; y: number }) => void;
  onGridVisibleChange: (visible: boolean) => void;
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  onSelectConstraint?: (constraintId: string) => void;
  onSelectEntity: (entityId: string) => void;
  onToolChange: (tool: EditorTool) => void;
  onViewportOffsetChange?: (offsetPx: { x: number; y: number }) => void;
  selectedRuntimeVelocityVector?: {
    entityId: string;
    velocityX: number;
    velocityY: number;
  } | null;
  state: import("../state/editorStore").EditorState;
  viewport?: UnitViewport;
};

type WorkspaceCanvasAuthoringPlacementStatus = "free" | "snap" | "blocked";

export type WorkspaceCanvasAuthoringPlacementPreview =
  | {
      contactWithEntityId?: string;
      entity: EditorSceneEntity;
      status: WorkspaceCanvasAuthoringPlacementStatus;
    }
  | null;

type EntityDragSession = {
  entityId: string;
  originScreenX: number;
  originScreenY: number;
  startClientX: number;
  startClientY: number;
};

type PanSession = {
  originOffsetX: number;
  originOffsetY: number;
  startClientX: number;
  startClientY: number;
};

type WorkspaceCanvasLibraryDragHover = {
  authoringPosition: { x: number; y: number } | null;
  isOverStage: boolean;
};

type ProjectedPlacementPreview = {
  contactWithEntityId?: string;
  entity: WorkspaceSceneEntity;
  status: WorkspaceCanvasAuthoringPlacementStatus;
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "14px 16px",
  borderBottom: "1px solid rgba(108, 128, 173, 0.14)",
  background: "rgba(255,255,255,0.72)",
};

const actionButtonStyle: CSSProperties = {
  border: "1px solid rgba(104, 124, 165, 0.24)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#18314f",
  padding: "8px 12px",
  cursor: "pointer",
};

const authoringLockMessage =
  "Playback running. Move, placement, and constraint editing are temporarily locked.";

function getEntityVisualStyle(
  entity: WorkspaceSceneEntity,
  isSelected: boolean,
  isContactTarget: boolean,
): CSSProperties {
  const rotationDegrees = getEntityRotationDegrees(entity);
  const boxShadows: string[] = [];

  if (entity.locked) {
    boxShadows.push("0 0 0 2px rgba(245, 181, 62, 0.45)");
  }

  if (isContactTarget) {
    boxShadows.push("0 0 0 4px rgba(27, 167, 132, 0.18)");
  }

  const baseStyle: CSSProperties = {
    position: "absolute",
    left: `${entity.x}px`,
    top: `${entity.y}px`,
    border: isContactTarget
      ? "1px solid rgba(18, 117, 93, 0.42)"
      : "1px solid rgba(17, 37, 64, 0.16)",
    background: isSelected ? "#2457a6" : "rgba(17, 37, 64, 0.88)",
    color: "#f7fbff",
    fontSize: entity.kind === "board" ? "10px" : "12px",
    cursor: "pointer",
    userSelect: "none",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    padding: 0,
    boxShadow: boxShadows.join(", ") || "none",
    transform: rotationDegrees === 0 ? undefined : `rotate(${rotationDegrees}deg)`,
    transformOrigin: "50% 50%",
    zIndex: 1,
  };

  if (entity.kind === "ball") {
    return {
      ...baseStyle,
      width: `${entity.radius * 2}px`,
      height: `${entity.radius * 2}px`,
      borderRadius: "999px",
    };
  }

  return {
    ...baseStyle,
    width: `${entity.width}px`,
    height: `${entity.height}px`,
    borderRadius: "0px",
  };
}

function getEntityCenter(entity: WorkspaceSceneEntity): { x: number; y: number } {
  if (entity.kind === "ball") {
    return {
      x: entity.x + entity.radius,
      y: entity.y + entity.radius,
    };
  }

  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

function createVectorStyle(
  center: { x: number; y: number },
  dx: number,
  dy: number,
  color: string,
): CSSProperties {
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    position: "absolute",
    left: `${center.x}px`,
    top: `${center.y}px`,
    width: `${length}px`,
    height: "2px",
    background: color,
    borderRadius: "999px",
    transform: `translateY(-50%) rotate(${angle}deg)`,
    transformOrigin: "0 50%",
    pointerEvents: "none",
  };
}

function createConstraintOverlayStyle(
  start: { x: number; y: number },
  angleDegrees: number,
  length: number,
  thickness: number,
  interactive: boolean,
): CSSProperties {
  return {
    position: "absolute",
    left: `${start.x}px`,
    top: `${start.y}px`,
    width: `${length}px`,
    height: `${thickness}px`,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: interactive ? "pointer" : "default",
    pointerEvents: interactive ? "auto" : "none",
    transform: `translateY(-50%) rotate(${angleDegrees}deg)`,
    transformOrigin: "0 50%",
    zIndex: 2,
  };
}

function createConstraintStrokeStyle(
  color: string,
  thickness: number,
  selected: boolean,
): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: "50%",
    width: "100%",
    height: `${selected ? thickness + 1 : thickness}px`,
    borderRadius: "999px",
    background: color,
    opacity: selected ? 0.98 : 0.78,
    transform: "translateY(-50%)",
    pointerEvents: "none",
    boxShadow: selected ? `0 0 0 2px ${color}26` : "none",
  };
}

function getVelocityVectorFromComponents(
  velocityX: number,
  velocityY: number,
): { dx: number; dy: number } | null {
  return mapCartesianVelocityToScreenVector({
    velocityX,
    velocityY,
  });
}

function getVelocityVector(entity: WorkspaceSceneEntity): { dx: number; dy: number } | null {
  return getVelocityVectorFromComponents(entity.velocityX, entity.velocityY);
}

function getForceVector(entity: WorkspaceSceneEntity): { dx: number; dy: number } | null {
  if (entity.locked) {
    return null;
  }

  return {
    dx: 0,
    dy: Math.max(18, Math.min(72, entity.mass * 10)),
  };
}

function createBodyDragPreviewStyle(
  preview: { screenPosition: { x: number; y: number } },
  bodyKind: LibraryDragSession["bodyKind"],
  blocked: boolean,
): CSSProperties {
  return {
    position: "absolute",
    left: `${preview.screenPosition.x}px`,
    top: `${preview.screenPosition.y}px`,
    borderRadius: bodyKind === "ball" ? "999px" : "0px",
    border: blocked
      ? "1px dashed rgba(185, 28, 28, 0.6)"
      : "1px dashed rgba(36, 87, 166, 0.55)",
    background: blocked ? "rgba(220, 38, 38, 0.12)" : "rgba(36, 87, 166, 0.12)",
    color: blocked ? "#991b1b" : "#17304f",
    fontSize: "11px",
    fontWeight: 700,
    padding: "6px 8px",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
  };
}

function getPlacementPreviewPalette(
  status: WorkspaceCanvasAuthoringPlacementStatus,
): {
  background: string;
  border: string;
  boxShadow: string;
  color: string;
} {
  switch (status) {
    case "snap":
      return {
        border: "1px solid rgba(18, 117, 93, 0.7)",
        background: "rgba(27, 167, 132, 0.14)",
        boxShadow: "0 0 0 2px rgba(27, 167, 132, 0.16)",
        color: "#12564a",
      };
    case "blocked":
      return {
        border: "1px dashed rgba(185, 28, 28, 0.6)",
        background: "rgba(220, 38, 38, 0.12)",
        boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.08)",
        color: "#991b1b",
      };
    case "free":
      return {
        border: "1px dashed rgba(36, 87, 166, 0.55)",
        background: "rgba(36, 87, 166, 0.12)",
        boxShadow: "0 0 0 2px rgba(36, 87, 166, 0.08)",
        color: "#17304f",
      };
  }
}

function createPlacementPreviewStyle(preview: ProjectedPlacementPreview): CSSProperties {
  const { background, border, boxShadow, color } = getPlacementPreviewPalette(preview.status);
  const rotationDegrees = getEntityRotationDegrees(preview.entity);
  const baseStyle: CSSProperties = {
    position: "absolute",
    left: `${preview.entity.x}px`,
    top: `${preview.entity.y}px`,
    border,
    background,
    boxShadow,
    color,
    fontSize: preview.entity.kind === "board" ? "10px" : "12px",
    fontWeight: 700,
    pointerEvents: "none",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    transform: rotationDegrees === 0 ? undefined : `rotate(${rotationDegrees}deg)`,
    transformOrigin: "50% 50%",
    zIndex: 3,
  };

  if (preview.entity.kind === "ball") {
    return {
      ...baseStyle,
      width: `${preview.entity.radius * 2}px`,
      height: `${preview.entity.radius * 2}px`,
      borderRadius: "999px",
    };
  }

  return {
    ...baseStyle,
    width: `${preview.entity.width}px`,
    height: `${preview.entity.height}px`,
    borderRadius: "0px",
  };
}

function getEntityRotationDegrees(entity: WorkspaceSceneEntity): number {
  if (entity.kind === "ball") {
    return 0;
  }

  return entity.rotationDegrees ?? 0;
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  const {
    authoringPlacementPreview = null,
    authoringLocked = false,
    constraintPlacement,
    constraints = [],
    display,
    displayEntities,
    entities,
    libraryDragBlocked = false,
    libraryDragSession = null,
    onCancelPlacement,
    onLibraryDragHoverChange,
    onPlaceConstraintEntity,
    onPlaceConstraintPoint,
    onMoveEntity,
    onSelectConstraint,
    onSelectEntity,
    onViewportOffsetChange,
    selectedRuntimeVelocityVector = null,
    state,
    viewport = DEFAULT_WORKSPACE_VIEWPORT,
  } = props;
  const [dragSession, setDragSession] = useState<EntityDragSession | null>(null);
  const [panSession, setPanSession] = useState<PanSession | null>(null);
  const [libraryDragPreview, setLibraryDragPreview] = useState<{
    authoringPosition: { x: number; y: number };
    screenPosition: { x: number; y: number };
  } | null>(null);
  const renderedEntities = displayEntities ?? entities;
  const projectedPlacementPreview = authoringPlacementPreview
    ? {
        ...authoringPlacementPreview,
        entity: projectAuthoringEntityToScreen(authoringPlacementPreview.entity, viewport),
      }
    : null;
  const contactTargetEntityId = projectedPlacementPreview?.contactWithEntityId ?? null;
  const sceneDomainOverlay = createSceneDomainOverlay(viewport);

  useEffect(() => {
    if (!dragSession) {
      return undefined;
    }

    const currentSession = dragSession;

    function handleMouseMove(event: globalThis.MouseEvent) {
      const deltaX = event.clientX - currentSession.startClientX;
      const deltaY = event.clientY - currentSession.startClientY;
      const screenPosition = {
        x: Math.round(currentSession.originScreenX + deltaX),
        y: Math.round(currentSession.originScreenY + deltaY),
      };

      onMoveEntity(
        currentSession.entityId,
        projectScreenPointToAuthoring(screenPosition, viewport),
      );
    }

    function handleMouseUp() {
      setDragSession(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragSession, onMoveEntity, viewport]);

  useEffect(() => {
    if (!panSession) {
      return undefined;
    }

    const currentSession = panSession;

    function handleMouseMove(event: globalThis.MouseEvent) {
      onViewportOffsetChange?.({
        x: Math.round(currentSession.originOffsetX + event.clientX - currentSession.startClientX),
        y: Math.round(currentSession.originOffsetY + event.clientY - currentSession.startClientY),
      });
    }

    function handleMouseUp() {
      setPanSession(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onViewportOffsetChange, panSession]);

  useEffect(() => {
    if (libraryDragSession) {
      return;
    }

    setLibraryDragPreview(null);
    onLibraryDragHoverChange?.(null);
  }, [libraryDragSession, onLibraryDragHoverChange]);

  function beginEntityDrag(entity: WorkspaceSceneEntity, event: MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0 || authoringLocked || state.activeTool === "place-constraint") {
      return;
    }

    setDragSession({
      entityId: entity.id,
      originScreenX: entity.x,
      originScreenY: entity.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    });
    onSelectEntity(entity.id);
  }

  function updateLibraryDragStageHover(
    screenPosition: { x: number; y: number },
  ) {
    if (!libraryDragSession) {
      return;
    }

    const authoringPosition = projectScreenPointToAuthoring(screenPosition, viewport);

    setLibraryDragPreview({
      authoringPosition,
      screenPosition,
    });
    onLibraryDragHoverChange?.({
      authoringPosition,
      isOverStage: true,
    });
  }

  function clearLibraryDragStageHover() {
    setLibraryDragPreview(null);
    onLibraryDragHoverChange?.({
      authoringPosition: null,
      isOverStage: false,
    });
  }

  function handleStageMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 2) {
      return;
    }

    const offsetPx = readViewportOffsetPx(viewport);

    event.preventDefault();
    setPanSession({
      originOffsetX: offsetPx.x,
      originOffsetY: offsetPx.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    });
  }

  function handleStageMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!libraryDragSession) {
      return;
    }

    const stageBounds = event.currentTarget.getBoundingClientRect();

    updateLibraryDragStageHover({
      x: Math.round(event.clientX - stageBounds.left),
      y: Math.round(event.clientY - stageBounds.top),
    });
  }

  function handleStageMouseLeave() {
    if (!libraryDragSession) {
      return;
    }

    clearLibraryDragStageHover();
  }

  function handleStageContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleStageClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const stageBounds = event.currentTarget.getBoundingClientRect();
    const screenPosition = {
      x: Math.round(event.clientX - stageBounds.left),
      y: Math.round(event.clientY - stageBounds.top),
    };
    const authoringPosition = projectScreenPointToAuthoring(screenPosition, viewport);

    if (authoringLocked) {
      return;
    }

    if (
      state.activeTool === "place-constraint" &&
      (constraintPlacement?.mode === "pick-point" || constraintPlacement?.mode === "pick-center")
    ) {
      onPlaceConstraintPoint?.(authoringPosition);
    }
  }

  function handleEntityClick(entityId: string) {
    if (authoringLocked) {
      onSelectEntity(entityId);
      return;
    }

    if (
      state.activeTool === "place-constraint" &&
      (constraintPlacement?.mode === "pick-entity" || constraintPlacement?.mode === "pick-ball")
    ) {
      onPlaceConstraintEntity?.(entityId);
      return;
    }

    onSelectEntity(entityId);
  }

  function getEntityById(entityId: string | null) {
    return entityId ? renderedEntities.find((entity) => entity.id === entityId) ?? null : null;
  }

  const constraintSelectionEnabled = !(state.activeTool === "place-constraint" && !authoringLocked);
  const selectedRuntimeVelocityEntity =
    selectedRuntimeVelocityVector && state.selectedEntityId === selectedRuntimeVelocityVector.entityId
      ? getEntityById(selectedRuntimeVelocityVector.entityId)
      : null;
  const selectedRuntimeVelocity =
    selectedRuntimeVelocityEntity?.kind === "ball" && selectedRuntimeVelocityVector
      ? getVelocityVectorFromComponents(
          selectedRuntimeVelocityVector.velocityX,
          selectedRuntimeVelocityVector.velocityY,
        )
      : null;

  function handleConstraintClick(
    event: MouseEvent<HTMLButtonElement>,
    constraintId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!constraintSelectionEnabled) {
      return;
    }

    onSelectConstraint?.(constraintId);
  }

  function renderConstraint(constraint: EditorConstraint) {
    const isSelected = state.selectedConstraintId === constraint.id;

    if (isArcTrackConstraint(constraint)) {
      return renderArcTrackConstraintOverlay({
        constraint,
        constraintSelectionEnabled,
        getEntityCenter: (entityId) => {
          const entity = getEntityById(entityId);

          return entity ? getEntityCenter(entity) : null;
        },
        isSelected,
        onConstraintClick: handleConstraintClick,
        viewport,
      });
    }

    if (constraint.kind === "spring") {
      const entityA = getEntityById(constraint.entityAId);
      const entityB = getEntityById(constraint.entityBId);

      if (!entityA || !entityB) {
        return null;
      }

      const start = getEntityCenter(entityA);
      const spring = createSpringOverlayGeometry(start, getEntityCenter(entityB));

      return (
        <button
          key={constraint.id}
          aria-label={`Select ${constraint.label}`}
          data-selected={String(isSelected)}
          data-rest-length={String(constraint.restLength)}
          data-testid={`scene-constraint-spring-${constraint.id}`}
          type="button"
          onClick={(event) => handleConstraintClick(event, constraint.id)}
          style={createConstraintOverlayStyle(
            start,
            spring.angleDegrees,
            spring.length,
            spring.hitboxThickness,
            constraintSelectionEnabled,
          )}
        >
          <svg
            aria-hidden="true"
            height={spring.hitboxThickness}
            style={{ display: "block", overflow: "visible", pointerEvents: "none" }}
            viewBox={`0 0 ${Math.max(spring.length, 1)} ${spring.hitboxThickness}`}
            width={spring.length}
          >
            <polyline
              fill="none"
              points={spring.pointsAttribute}
              stroke={isSelected ? "#5435c7" : "#6d58c9"}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={isSelected ? spring.strokeThickness + 1 : spring.strokeThickness}
            />
          </svg>
        </button>
      );
    }

    const attachedEntity = getEntityById(constraint.entityId);

    if (!attachedEntity) {
      return null;
    }

    const origin = constraint.origin;
    const end = {
      x: origin.x + constraint.axis.x,
      y: origin.y + constraint.axis.y,
    };
    const projectedOrigin = projectAuthoringPointToScreen(origin, viewport);
    const projectedEnd = projectAuthoringPointToScreen(end, viewport);
    const track = createConstraintLineGeometry(projectedOrigin, projectedEnd);

    return (
      <button
        key={constraint.id}
        aria-label={`Select ${constraint.label}`}
        data-selected={String(isSelected)}
        data-testid={`scene-constraint-track-${constraint.id}`}
        type="button"
        onClick={(event) => handleConstraintClick(event, constraint.id)}
        style={createConstraintOverlayStyle(
          projectedOrigin,
          track.angleDegrees,
          track.length,
          track.hitboxThickness,
          constraintSelectionEnabled,
        )}
      >
        <span
          aria-hidden="true"
          style={createConstraintStrokeStyle(
            isSelected ? "#12755d" : "#1ba784",
            track.strokeThickness,
            isSelected,
          )}
        />
      </button>
    );
  }

  return (
    <section
      data-grid-visible={String(display.gridVisible)}
      data-testid="workspace-canvas"
      data-tool={state.activeTool}
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        minHeight: "100%",
      }}
    >
      <div style={toolbarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {authoringLocked ? (
            <span style={{ color: "#a04b00", fontSize: "13px", fontWeight: 600 }}>
              {authoringLockMessage}
            </span>
          ) : null}
          {constraintPlacement ? (
            <>
              <span style={{ color: "#516276", fontSize: "13px" }}>{constraintPlacement.hint}</span>
              <button style={actionButtonStyle} type="button" onClick={onCancelPlacement}>
                Cancel placement
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div
        data-testid="workspace-stage"
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#f4f7fb",
          backgroundImage: display.gridVisible
            ? "linear-gradient(0deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.6), rgba(240,244,252,0.92))"
            : "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(240,244,252,0.95))",
          backgroundRepeat: "repeat, repeat, no-repeat",
          backgroundSize: display.gridVisible ? "24px 24px, 24px 24px, auto" : "auto",
        }}
        onClick={handleStageClick}
        onContextMenu={handleStageContextMenu}
        onMouseDown={handleStageMouseDown}
        onMouseLeave={handleStageMouseLeave}
        onMouseMove={handleStageMouseMove}
      >
        {sceneDomainOverlay.invalidRegions.map((region) => (
          <div key={region.testId} data-testid={region.testId} style={region.style} />
        ))}
        <div
          data-testid={sceneDomainOverlay.yAxis.testId}
          style={sceneDomainOverlay.yAxis.style}
        />
        <div
          data-testid={sceneDomainOverlay.xAxis.testId}
          style={sceneDomainOverlay.xAxis.style}
        />
        <div
          style={{
            position: "absolute",
            inset: "20px",
            borderRadius: "18px",
            border: "1px dashed rgba(101, 124, 165, 0.35)",
            pointerEvents: "none",
          }}
        />

        {display.showVelocityVectors
          ? renderedEntities.map((entity) => {
              if (selectedRuntimeVelocityEntity?.id === entity.id && selectedRuntimeVelocity) {
                return null;
              }

              const vector = getVelocityVector(entity);

              if (!vector) {
                return null;
              }

              return (
                <div
                  key={`velocity-${entity.id}`}
                  data-testid={`scene-velocity-vector-${entity.id}`}
                  style={createVectorStyle(getEntityCenter(entity), vector.dx, vector.dy, "#1d70d6")}
                />
              );
            })
          : null}

        {selectedRuntimeVelocity && selectedRuntimeVelocityEntity ? (
          <div
            data-testid={`scene-selected-runtime-velocity-${selectedRuntimeVelocityEntity.id}`}
            style={createVectorStyle(
              getEntityCenter(selectedRuntimeVelocityEntity),
              selectedRuntimeVelocity.dx,
              selectedRuntimeVelocity.dy,
              "#2457a6",
            )}
          />
        ) : null}

        {display.showForceVectors
          ? renderedEntities.map((entity) => {
              const vector = getForceVector(entity);

              if (!vector) {
                return null;
              }

              return (
                <div
                  key={`force-${entity.id}`}
                  data-testid={`scene-force-vector-${entity.id}`}
                  style={createVectorStyle(getEntityCenter(entity), vector.dx, vector.dy, "#ef7d33")}
                />
              );
            })
          : null}

        {constraints.map(renderConstraint)}

        {projectedPlacementPreview ? (
          <div
            data-body-kind={projectedPlacementPreview.entity.kind}
            data-placement-valid={String(projectedPlacementPreview.status !== "blocked")}
            data-preview-status={projectedPlacementPreview.status}
            data-testid="workspace-stage-body-preview"
            style={createPlacementPreviewStyle(projectedPlacementPreview)}
          >
            {projectedPlacementPreview.entity.label}
          </div>
        ) : libraryDragSession && libraryDragPreview ? (
          <div
            data-body-kind={libraryDragSession.bodyKind}
            data-placement-valid={String(!libraryDragBlocked)}
            data-preview-status={libraryDragBlocked ? "blocked" : "free"}
            data-testid="workspace-stage-body-preview"
            style={createBodyDragPreviewStyle(
              libraryDragPreview,
              libraryDragSession.bodyKind,
              libraryDragBlocked,
            )}
          >
            {libraryDragSession.bodyKind}
          </div>
        ) : null}

        {renderedEntities.map((entity) => (
          <button
            key={entity.id}
            aria-label={`Select ${entity.label}`}
            data-contact-target={String(contactTargetEntityId === entity.id)}
            data-locked={String(entity.locked)}
            data-selected={String(state.selectedEntityId === entity.id)}
            data-testid={`scene-entity-${entity.id}`}
            type="button"
            onClick={() => handleEntityClick(entity.id)}
            style={getEntityVisualStyle(
              entity,
              state.selectedEntityId === entity.id,
              contactTargetEntityId === entity.id,
            )}
            onMouseDown={(event) => beginEntityDrag(entity, event)}
          >
            {entity.locked ? (
              <span
                data-testid={`scene-entity-lock-${entity.id}`}
                style={{
                  position: "absolute",
                  top: "2px",
                  right: "4px",
                  borderRadius: "999px",
                  background: "rgba(245, 181, 62, 0.92)",
                  color: "#17304f",
                  fontSize: "9px",
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
              >
                FIX
              </span>
            ) : null}
            {display.showLabels ? entity.label : null}
          </button>
        ))}
      </div>
    </section>
  );
}
