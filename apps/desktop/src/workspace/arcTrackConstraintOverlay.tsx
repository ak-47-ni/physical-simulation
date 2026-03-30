import type { CSSProperties, MouseEvent, ReactElement } from "react";

import type { ArcTrackConstraintDraft } from "../state/createArcTrackConstraint";
import type { EditorConstraint } from "../state/editorConstraints";
import {
  createArcOverlayGeometry,
  type OverlayPoint,
} from "./constraintOverlayGeometry";
import {
  authoringLengthToScreenPixels,
  projectAuthoringPointToScreen,
  type UnitViewport,
} from "./unitViewport";

type ArcTrackConstraintRenderable = ArcTrackConstraintDraft & {
  label?: string;
};

type RenderArcTrackConstraintOverlayInput = {
  constraint: ArcTrackConstraintRenderable;
  constraintSelectionEnabled: boolean;
  getEntityCenter: (entityId: string) => OverlayPoint | null;
  isSelected: boolean;
  onConstraintClick: (event: MouseEvent<HTMLButtonElement>, constraintId: string) => void;
  viewport: UnitViewport;
};

function createArcConstraintOverlayStyle(
  bounds: {
    height: number;
    left: number;
    top: number;
    width: number;
  },
  interactive: boolean,
): CSSProperties {
  return {
    position: "absolute",
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: interactive ? "pointer" : "default",
    pointerEvents: interactive ? "auto" : "none",
    zIndex: 2,
  };
}

export function isArcTrackConstraint(
  constraint: EditorConstraint,
): constraint is ArcTrackConstraintRenderable {
  const candidate = constraint as EditorConstraint & Partial<ArcTrackConstraintRenderable>;

  return (
    candidate.kind === "arc-track" &&
    typeof candidate.entityId === "string" &&
    typeof candidate.radius === "number" &&
    typeof candidate.startAngleDegrees === "number" &&
    typeof candidate.endAngleDegrees === "number" &&
    candidate.side !== undefined &&
    candidate.center !== undefined &&
    typeof candidate.center.x === "number" &&
    typeof candidate.center.y === "number"
  );
}

export function renderArcTrackConstraintOverlay(
  input: RenderArcTrackConstraintOverlayInput,
): ReactElement | null {
  if (!input.getEntityCenter(input.constraint.entityId)) {
    return null;
  }

  const arc = createArcOverlayGeometry({
    center: projectAuthoringPointToScreen(input.constraint.center, input.viewport),
    endAngleDegrees: input.constraint.endAngleDegrees,
    radius: authoringLengthToScreenPixels(input.constraint.radius, input.viewport),
    startAngleDegrees: input.constraint.startAngleDegrees,
  });

  return (
    <button
      key={input.constraint.id}
      aria-label={`Select ${input.constraint.label ?? input.constraint.id}`}
      data-selected={String(input.isSelected)}
      data-testid={`scene-constraint-arc-track-${input.constraint.id}`}
      type="button"
      onClick={(event) => input.onConstraintClick(event, input.constraint.id)}
      style={createArcConstraintOverlayStyle(arc.bounds, input.constraintSelectionEnabled)}
    >
      <svg
        aria-hidden="true"
        height={arc.bounds.height}
        style={{ display: "block", overflow: "visible", pointerEvents: "none" }}
        viewBox={`0 0 ${Math.max(arc.bounds.width, 1)} ${Math.max(arc.bounds.height, 1)}`}
        width={arc.bounds.width}
      >
        <path
          d={arc.pathData}
          data-testid={`scene-constraint-arc-track-${input.constraint.id}-path`}
          fill="none"
          stroke={input.isSelected ? "#12755d" : "#1ba784"}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={input.isSelected ? arc.strokeThickness + 1 : arc.strokeThickness}
        />
      </svg>
    </button>
  );
}
