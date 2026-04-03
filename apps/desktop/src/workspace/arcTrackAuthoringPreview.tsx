import type { CSSProperties, ReactElement } from "react";

import { getBoardArcEndpoint } from "../state/boardArcPlacement";
import type { EditorConstraint } from "../state/editorConstraints";
import type { EditorSceneEntity } from "../state/editorStore";
import {
  createConstraintLineGeometry,
} from "./constraintOverlayGeometry";
import {
  createArcTrackProfileGeometryFromAngles,
  DEFAULT_ARC_TRACK_THICKNESS,
} from "./arcTrackBodyEntity";
import {
  authoringLengthToScreenPixels,
  projectAuthoringPointToScreen,
  type UnitViewport,
} from "./unitViewport";

type ArcTrackPreviewConstraint = Extract<EditorConstraint, { kind: "arc-track" }>;

export type ArcTrackSpanPreset = 90 | 180 | 270;

type RenderArcTrackAuthoringPreviewInput = {
  board: Extract<EditorSceneEntity, { kind: "board" }>;
  endpointKey: "start" | "end";
  onSelectSpanPreset?: (spanDegrees: ArcTrackSpanPreset) => void;
  previewConstraint: ArcTrackPreviewConstraint;
  radiusLabel?: string | null;
  selectedSpanDegrees?: ArcTrackSpanPreset | null;
  spanPresetOptions?: readonly ArcTrackSpanPreset[];
  viewport: UnitViewport;
};

function createGuideLineStyle(
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  thickness: number,
  dashPattern?: string,
): CSSProperties {
  const line = createConstraintLineGeometry(start, end);

  return {
    position: "absolute",
    left: `${start.x}px`,
    top: `${start.y}px`,
    width: `${line.length}px`,
    height: `${thickness}px`,
    borderRadius: "999px",
    background: color,
    opacity: 0.9,
    transform: `translateY(-50%) rotate(${line.angleDegrees}deg)`,
    transformOrigin: "0 50%",
    pointerEvents: "none",
    ...(dashPattern
      ? {
          backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 12px, transparent 12px 18px)`,
          backgroundColor: "transparent",
        }
      : null),
  };
}

function createRadiusReadoutStyle(
  center: { x: number; y: number },
  endpoint: { x: number; y: number },
): CSSProperties {
  return {
    position: "absolute",
    left: `${(center.x + endpoint.x) / 2}px`,
    top: `${(center.y + endpoint.y) / 2 - 18}px`,
    transform: "translate(-50%, -50%)",
    borderRadius: "999px",
    border: "1px solid rgba(20, 75, 122, 0.16)",
    background: "rgba(255, 255, 255, 0.94)",
    color: "#18314f",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1,
    padding: "8px 10px",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  };
}

function createPresetPanelStyle(bounds: {
  left: number;
  top: number;
  width: number;
}): CSSProperties {
  return {
    position: "absolute",
    left: `${bounds.left + bounds.width / 2}px`,
    top: `${Math.max(12, bounds.top - 54)}px`,
    transform: "translateX(-50%)",
    display: "flex",
    gap: "8px",
    pointerEvents: "auto",
    zIndex: 6,
  };
}

function createPresetButtonStyle(selected: boolean): CSSProperties {
  return {
    border: selected ? "1px solid #0f766e" : "1px solid rgba(104, 124, 165, 0.28)",
    borderRadius: "999px",
    background: selected ? "#ccfbf1" : "rgba(255, 255, 255, 0.96)",
    color: selected ? "#115e59" : "#18314f",
    boxShadow: selected ? "0 0 0 3px rgba(20, 184, 166, 0.12)" : "0 6px 16px rgba(15, 23, 42, 0.08)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
    lineHeight: 1,
    padding: "8px 12px",
  };
}

export function renderArcTrackAuthoringPreview(
  input: RenderArcTrackAuthoringPreviewInput,
): ReactElement {
  const endpoint = getBoardArcEndpoint(input.board, input.endpointKey);
  const projectedEndpoint = projectAuthoringPointToScreen(endpoint.point, input.viewport);
  const projectedCenter = projectAuthoringPointToScreen(
    input.previewConstraint.center,
    input.viewport,
  );
  const previewArc = createArcTrackProfileGeometryFromAngles({
    center: projectedCenter,
    endAngleDegrees: input.previewConstraint.endAngleDegrees,
    radius: authoringLengthToScreenPixels(input.previewConstraint.radius, input.viewport),
    startAngleDegrees: input.previewConstraint.startAngleDegrees,
    thickness: authoringLengthToScreenPixels(DEFAULT_ARC_TRACK_THICKNESS, input.viewport),
  });
  const tangentGuideEnd = projectAuthoringPointToScreen(
    {
      x: endpoint.point.x + endpoint.tangent.x * Math.max(0.3, input.previewConstraint.radius * 0.35),
      y: endpoint.point.y + endpoint.tangent.y * Math.max(0.3, input.previewConstraint.radius * 0.35),
    },
    input.viewport,
  );

  return (
    <>
      <div
        data-testid="workspace-arc-track-preview"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}
      >
        <div
          data-testid="workspace-arc-track-preview-radius-guide"
          style={createGuideLineStyle(
            projectedCenter,
            projectedEndpoint,
            "rgba(14, 116, 144, 0.92)",
            3,
            "12 6",
          )}
        />
        <div
          data-testid="workspace-arc-track-preview-tangent-guide"
          style={createGuideLineStyle(
            projectedEndpoint,
            tangentGuideEnd,
            "rgba(20, 184, 166, 0.92)",
            4,
          )}
        />
        <svg
          aria-hidden="true"
          height={previewArc.bounds.height}
          style={{
            position: "absolute",
            left: `${previewArc.bounds.left}px`,
            top: `${previewArc.bounds.top}px`,
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${Math.max(previewArc.bounds.width, 1)} ${Math.max(
            previewArc.bounds.height,
            1,
          )}`}
          width={previewArc.bounds.width}
        >
          <path
            d={previewArc.pathData}
            data-testid="workspace-arc-track-preview-path"
            fill="rgba(15, 118, 110, 0.16)"
            stroke="#0f766e"
            strokeLinejoin="miter"
            strokeWidth={previewArc.outlineWidth}
          />
        </svg>
        {input.radiusLabel ? (
          <div
            data-testid="workspace-arc-track-radius-readout"
            style={createRadiusReadoutStyle(projectedCenter, projectedEndpoint)}
          >
            {`R ${input.radiusLabel}`}
          </div>
        ) : null}
      </div>
      {input.spanPresetOptions?.length ? (
        <div style={createPresetPanelStyle(previewArc.bounds)}>
          {input.spanPresetOptions.map((spanDegrees) => {
            const isSelected = input.selectedSpanDegrees === spanDegrees;

            return (
              <button
                key={spanDegrees}
                data-selected={String(isSelected)}
                data-testid={`workspace-arc-track-span-preset-${spanDegrees}`}
                style={createPresetButtonStyle(isSelected)}
                type="button"
                onClick={() => input.onSelectSpanPreset?.(spanDegrees)}
              >
                {`${spanDegrees}°`}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
