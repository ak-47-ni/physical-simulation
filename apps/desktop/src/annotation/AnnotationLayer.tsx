import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";

import type { AnnotationStroke, Vector2 } from "../../../../packages/scene-schema/src";

type AnnotationLayerStroke = AnnotationStroke & {
  color: string;
};

const palette = [
  { label: "Black ink", value: "#111827" },
  { label: "Blue ink", value: "#2563eb" },
  { label: "Red ink", value: "#dc2626" },
];

const panelStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
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

const surfaceStyle: CSSProperties = {
  position: "relative",
  height: "240px",
  borderRadius: "18px",
  border: "1px dashed rgba(108, 128, 173, 0.28)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,245,252,0.96))",
  overflow: "hidden",
};

export function AnnotationLayer() {
  const [strokes, setStrokes] = useState<AnnotationLayerStroke[]>([]);
  const [activeColor, setActiveColor] = useState(palette[0].value);
  const [visible, setVisible] = useState(true);
  const [draftPoints, setDraftPoints] = useState<Vector2[] | null>(null);

  function toPoint(event: ReactPointerEvent<HTMLDivElement>): Vector2 {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    setDraftPoints([toPoint(event)]);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    setDraftPoints((current) => {
      if (!current) {
        return current;
      }

      return [...current, toPoint(event)];
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draftPoints) {
      return;
    }

    const points = [...draftPoints, toPoint(event)];

    setStrokes((existing) => [
      ...existing,
      {
        id: `stroke-${existing.length}`,
        color: activeColor,
        points,
      },
    ]);
    setDraftPoints(null);
  }

  return (
    <div data-testid="annotation-layer" data-visible={visible} style={panelStyle}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {palette.map((entry) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={activeColor === entry.value}
            style={{
              ...buttonStyle,
              background: activeColor === entry.value ? entry.value : "#ffffff",
              color: activeColor === entry.value ? "#f8fafc" : "#17304f",
            }}
            onClick={() => {
              setActiveColor(entry.value);
            }}
          >
            {entry.label}
          </button>
        ))}
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            setStrokes((current) => current.slice(0, -1));
          }}
        >
          Erase last stroke
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            setVisible((current) => !current);
          }}
        >
          {visible ? "Hide annotations" : "Show annotations"}
        </button>
      </div>

      <div
        data-testid="annotation-layer-surface"
        style={surfaceStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {visible ? (
          <svg
            aria-label="Annotation strokes"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 240 240"
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
