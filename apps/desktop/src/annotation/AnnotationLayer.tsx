import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useState } from "react";

import type { AnnotationStroke, Vector2 } from "../../../../packages/scene-schema/src";
import { useI18n } from "../i18n";

export type AnnotationLayerStroke = AnnotationStroke & {
  color: string;
};

export type AnnotationLayerTool = "ink" | "eraser";

export type AnnotationLayerState = {
  strokes: AnnotationLayerStroke[];
  visible: boolean;
  activeColor: string;
  active: boolean;
  tool: AnnotationLayerTool;
};

const DEFAULT_ANNOTATION_COLOR = "#000000";
const ERASER_RADIUS_PX = 12;
const PEN_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23112540' d='M4 17.25V21h3.75L18.81 9.94l-3.75-3.75L4 17.25z'/%3E%3Cpath fill='%23ffffff' d='m16.06 5.19 1.77-1.77 3.75 3.75-1.77 1.77z'/%3E%3C/svg%3E\") 2 22, crosshair";
const ERASER_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='white' stroke='%23112540' stroke-width='2'/%3E%3Cpath d='M7 17 17 7' stroke='%23112540' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E\") 12 12, cell";

const panelStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(108, 128, 173, 0.16)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#17304f",
  padding: "8px 12px",
  fontSize: "13px",
  cursor: "pointer",
};

const colorPickerLabelStyle: CSSProperties = {
  alignItems: "center",
  border: "1px solid rgba(108, 128, 173, 0.16)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#17304f",
  display: "inline-flex",
  gap: "8px",
  padding: "6px 10px",
  fontSize: "13px",
};

const colorInputStyle: CSSProperties = {
  width: "34px",
  height: "26px",
  border: "0",
  borderRadius: "999px",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
};

const toolbarStyle: CSSProperties = {
  position: "absolute",
  top: "14px",
  left: "14px",
  zIndex: 2,
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  alignItems: "center",
  padding: "8px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.86)",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  boxShadow: "0 10px 24px rgba(25, 48, 89, 0.12)",
  backdropFilter: "blur(12px)",
  pointerEvents: "auto",
};

const surfaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
};

type AnnotationLayerProps = {
  state?: AnnotationLayerState;
  onStateChange?: (nextState: AnnotationLayerState) => void;
};

export function createInitialAnnotationLayerState(): AnnotationLayerState {
  return {
    strokes: [],
    visible: true,
    activeColor: DEFAULT_ANNOTATION_COLOR,
    active: false,
    tool: "ink",
  };
}

export function AnnotationLayer(props: AnnotationLayerProps = {}) {
  const { t } = useI18n();
  const [internalState, setInternalState] = useState<AnnotationLayerState>(
    createInitialAnnotationLayerState,
  );
  const [draftPoints, setDraftPoints] = useState<Vector2[] | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const state = props.state ?? internalState;
  const { active, activeColor, strokes, tool, visible } = state;

  function updateState(nextState: AnnotationLayerState) {
    if (props.onStateChange) {
      props.onStateChange(nextState);
      return;
    }

    setInternalState(nextState);
  }

  function toPoint(event: ReactPointerEvent<HTMLDivElement>): Vector2 {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;

    return {
      x: Math.round(clientX - bounds.left),
      y: Math.round(clientY - bounds.top),
    };
  }

  function isPrimaryPointerButton(event: ReactPointerEvent<HTMLDivElement>): boolean {
    return event.button === 0 || event.button === undefined;
  }

  function activateTool(nextTool: AnnotationLayerTool) {
    updateState({
      ...state,
      active: true,
      tool: nextTool,
      visible: true,
    });
    setDraftPoints(null);
    setIsErasing(false);
  }

  function getDistance(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function splitStrokeAroundPoint(stroke: AnnotationLayerStroke, point: Vector2) {
    const segments: AnnotationLayerStroke[] = [];
    let currentPoints: Vector2[] = [];
    let erasedAnyPoint = false;

    stroke.points.forEach((candidate) => {
      if (getDistance(candidate, point) <= ERASER_RADIUS_PX) {
        erasedAnyPoint = true;

        if (currentPoints.length >= 2) {
          segments.push({
            ...stroke,
            id: `${stroke.id}-segment-${segments.length}`,
            points: currentPoints,
          });
        }

        currentPoints = [];
        return;
      }

      currentPoints.push(candidate);
    });

    if (!erasedAnyPoint) {
      return [stroke];
    }

    if (currentPoints.length >= 2) {
      segments.push({
        ...stroke,
        id: `${stroke.id}-segment-${segments.length}`,
        points: currentPoints,
      });
    }

    return segments;
  }

  function eraseAtPoint(point: Vector2) {
    const nextStrokes = strokes.flatMap((stroke) => splitStrokeAroundPoint(stroke, point));

    if (
      nextStrokes.length === strokes.length &&
      nextStrokes.every((stroke, index) => stroke === strokes[index])
    ) {
      return;
    }

    updateState({
      ...state,
      strokes: nextStrokes,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active || !isPrimaryPointerButton(event)) {
      return;
    }

    event.preventDefault();

    if (tool === "eraser") {
      setIsErasing(true);
      eraseAtPoint(toPoint(event));
      return;
    }

    setDraftPoints([toPoint(event)]);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const nextPoint = toPoint(event);

    if (active && tool === "eraser" && isErasing) {
      eraseAtPoint(nextPoint);
      return;
    }

    setDraftPoints((current) => {
      if (!current) {
        return current;
      }

      return [...current, nextPoint];
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active || !isPrimaryPointerButton(event)) {
      return;
    }

    event.preventDefault();

    if (tool === "eraser") {
      setIsErasing(false);
      return;
    }

    if (!draftPoints) {
      return;
    }

    const points = [...draftPoints, toPoint(event)];

    updateState({
      ...state,
      strokes: [
        ...strokes,
        {
          id: `stroke-${strokes.length}`,
          color: activeColor,
          points,
        },
      ],
    });
    setDraftPoints(null);
  }

  function eraseLastStroke() {
    updateState({
      ...state,
      strokes: strokes.slice(0, -1),
    });
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!active) {
      return;
    }

    event.preventDefault();
    eraseLastStroke();
  }

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      updateState({
        ...state,
        active: false,
      });
      setDraftPoints(null);
      setIsErasing(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, state]);

  return (
    <div
      data-active={active}
      data-tool={tool}
      data-testid="annotation-layer"
      data-visible={visible}
      style={{
        ...panelStyle,
        pointerEvents: "none",
      }}
    >
      <div style={toolbarStyle}>
        <button
          type="button"
          aria-pressed={active && tool === "ink"}
          style={{
            ...buttonStyle,
            background: active && tool === "ink" ? "#112540" : "#ffffff",
            color: active && tool === "ink" ? "#f8fafc" : "#17304f",
          }}
          onClick={() => {
            activateTool("ink");
          }}
        >
          {t("annotation.ink")}
        </button>
        <button
          type="button"
          aria-pressed={active && tool === "eraser"}
          style={{
            ...buttonStyle,
            background: active && tool === "eraser" ? "#112540" : "#ffffff",
            color: active && tool === "eraser" ? "#f8fafc" : "#17304f",
          }}
          onClick={() => {
            activateTool("eraser");
          }}
        >
          {t("annotation.eraser")}
        </button>
        <label style={colorPickerLabelStyle}>
          <span>{t("annotation.colorPicker")}</span>
          <input
            aria-label={t("annotation.colorPicker")}
            data-testid="annotation-color-picker"
            type="color"
            value={activeColor}
            style={colorInputStyle}
            onChange={(event) => {
              updateState({
                ...state,
                activeColor: event.currentTarget.value,
              });
            }}
          />
        </label>
        <button
          type="button"
          style={buttonStyle}
          onClick={eraseLastStroke}
        >
          {t("annotation.eraseLastStroke")}
        </button>
        {active ? (
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              updateState({
                ...state,
                active: false,
              });
              setDraftPoints(null);
              setIsErasing(false);
            }}
          >
            {t("annotation.cancelInk")}
          </button>
        ) : null}
      </div>

      <div
        data-testid="annotation-layer-surface"
        style={{
          ...surfaceStyle,
          cursor: active ? (tool === "eraser" ? ERASER_CURSOR : PEN_CURSOR) : "default",
          pointerEvents: active ? "auto" : "none",
        }}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          setIsErasing(false);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {visible ? (
          <svg
            aria-label={t("annotation.canvasLabel")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {strokes.map((stroke, index) => (
              <polyline
                key={stroke.id}
                data-testid={`annotation-stroke-${index}`}
                data-color={stroke.color}
                points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={stroke.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            ))}
            {draftPoints ? (
              <polyline
                points={draftPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={activeColor}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            ) : null}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
