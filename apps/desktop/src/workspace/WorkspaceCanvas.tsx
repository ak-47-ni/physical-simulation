import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

import type { SceneDisplaySettings } from "../io/sceneFile";
import type { EditorConstraint, LibraryConstraintKind } from "../state/editorConstraints";
import type { EditorSceneEntity, EditorState } from "../state/editorStore";
import type { LibraryDragSession } from "./libraryDragSession";
import type { EditorTool } from "./tools";
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
  mode: "pick-entity" | "pick-point";
};

type WorkspaceCanvasProps = {
  authoringLocked?: boolean;
  constraintPlacement?: ConstraintPlacementState | null;
  constraints?: EditorConstraint[];
  display: SceneDisplaySettings;
  displayEntities?: EditorSceneEntity[];
  entities: EditorSceneEntity[];
  libraryDragSession?: LibraryDragSession | null;
  onCancelPlacement?: () => void;
  onCreateEntity: (position: { x: number; y: number }) => void;
  onLibraryDragHoverChange?: (hover: WorkspaceCanvasLibraryDragHover | null) => void;
  onPlaceConstraintEntity?: (entityId: string) => void;
  onPlaceConstraintPoint?: (position: { x: number; y: number }) => void;
  onGridVisibleChange: (visible: boolean) => void;
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  onSelectEntity: (entityId: string) => void;
  onToolChange: (tool: EditorTool) => void;
  onViewportOffsetChange?: (offsetPx: { x: number; y: number }) => void;
  state: EditorState;
  viewport?: UnitViewport;
};

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
  entity: EditorSceneEntity,
  isSelected: boolean,
): CSSProperties {
  const baseStyle: CSSProperties = {
    position: "absolute",
    left: `${entity.x}px`,
    top: `${entity.y}px`,
    border: "1px solid rgba(17, 37, 64, 0.16)",
    background: isSelected ? "#2457a6" : "rgba(17, 37, 64, 0.88)",
    color: "#f7fbff",
    fontSize: entity.kind === "board" ? "10px" : "12px",
    cursor: "pointer",
    userSelect: "none",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    padding: 0,
    boxShadow: entity.locked ? "0 0 0 2px rgba(245, 181, 62, 0.45)" : "none",
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
    borderRadius: entity.kind === "polygon" ? "20px" : "12px",
  };
}

function getEntityCenter(entity: EditorSceneEntity): { x: number; y: number } {
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

function createConstraintStyle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
): CSSProperties {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    position: "absolute",
    left: `${start.x}px`,
    top: `${start.y}px`,
    width: `${length}px`,
    height: "4px",
    borderRadius: "999px",
    background: color,
    opacity: 0.72,
    transform: `translateY(-50%) rotate(${angle}deg)`,
    transformOrigin: "0 50%",
    pointerEvents: "none",
  };
}

function getVelocityVector(entity: EditorSceneEntity): { dx: number; dy: number } | null {
  const speed = Math.hypot(entity.velocityX, entity.velocityY);

  if (speed === 0) {
    return null;
  }

  const length = Math.max(18, Math.min(84, speed * 3));

  return {
    dx: (entity.velocityX / speed) * length,
    dy: (entity.velocityY / speed) * length,
  };
}

function getForceVector(entity: EditorSceneEntity): { dx: number; dy: number } | null {
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
): CSSProperties {
  return {
    position: "absolute",
    left: `${preview.screenPosition.x}px`,
    top: `${preview.screenPosition.y}px`,
    borderRadius: "999px",
    border: "1px dashed rgba(36, 87, 166, 0.55)",
    background: "rgba(36, 87, 166, 0.12)",
    color: "#17304f",
    fontSize: "11px",
    fontWeight: 700,
    padding: "6px 8px",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
  };
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  const {
    authoringLocked = false,
    constraintPlacement,
    constraints = [],
    display,
    displayEntities,
    entities,
    libraryDragSession = null,
    onCancelPlacement,
    onLibraryDragHoverChange,
    onPlaceConstraintEntity,
    onPlaceConstraintPoint,
    onGridVisibleChange,
    onMoveEntity,
    onSelectEntity,
    onViewportOffsetChange,
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

  function beginEntityDrag(entity: EditorSceneEntity, event: MouseEvent<HTMLButtonElement>) {
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
    if (event.button !== 2 || event.target !== event.currentTarget) {
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

    if (state.activeTool === "place-constraint" && constraintPlacement?.mode === "pick-point") {
      onPlaceConstraintPoint?.(authoringPosition);
    }
  }

  function handleEntityClick(entityId: string) {
    if (authoringLocked) {
      onSelectEntity(entityId);
      return;
    }

    if (state.activeTool === "place-constraint" && constraintPlacement?.mode === "pick-entity") {
      onPlaceConstraintEntity?.(entityId);
      return;
    }

    onSelectEntity(entityId);
  }

  function getEntityById(entityId: string | null) {
    return entityId ? renderedEntities.find((entity) => entity.id === entityId) ?? null : null;
  }

  function renderConstraint(constraint: EditorConstraint) {
    if (constraint.kind === "spring") {
      const entityA = getEntityById(constraint.entityAId);
      const entityB = getEntityById(constraint.entityBId);

      if (!entityA || !entityB) {
        return null;
      }

      return (
        <div
          key={constraint.id}
          data-rest-length={String(constraint.restLength)}
          data-testid={`scene-constraint-spring-${constraint.id}`}
          style={createConstraintStyle(getEntityCenter(entityA), getEntityCenter(entityB), "#6d58c9")}
        />
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

    return (
      <div
        key={constraint.id}
        data-testid={`scene-constraint-track-${constraint.id}`}
        style={createConstraintStyle(projectedOrigin, projectedEnd, "#1ba784")}
      />
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
          <button
            style={actionButtonStyle}
            type="button"
            onClick={() => onGridVisibleChange(!display.gridVisible)}
          >
            {display.gridVisible ? "Hide grid" : "Show grid"}
          </button>
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

        {libraryDragSession && libraryDragPreview ? (
          <div
            data-body-kind={libraryDragSession.bodyKind}
            data-testid="workspace-stage-body-preview"
            style={createBodyDragPreviewStyle(libraryDragPreview)}
          >
            {libraryDragSession.bodyKind}
          </div>
        ) : null}

        {renderedEntities.map((entity) => (
          <button
            key={entity.id}
            aria-label={`Select ${entity.label}`}
            data-locked={String(entity.locked)}
            data-selected={String(state.selectedEntityId === entity.id)}
            data-testid={`scene-entity-${entity.id}`}
            type="button"
            onClick={() => handleEntityClick(entity.id)}
            style={getEntityVisualStyle(entity, state.selectedEntityId === entity.id)}
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
