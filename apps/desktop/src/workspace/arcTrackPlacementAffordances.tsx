import type { CSSProperties, ReactElement } from "react";

import { getBoardArcEndpoints } from "../state/boardArcPlacement";
import type { EditorSceneEntity } from "../state/editorStore";
import { projectAuthoringPointToScreen, type UnitViewport } from "./unitViewport";

function createArcEndpointAffordanceStyle(
  center: { x: number; y: number },
  selected: boolean,
): CSSProperties {
  const size = selected ? 18 : 14;

  return {
    position: "absolute",
    left: `${center.x - size / 2}px`,
    top: `${center.y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "999px",
    border: selected ? "2px solid #0f766e" : "2px solid rgba(15, 118, 110, 0.72)",
    background: selected ? "#14b8a6" : "rgba(20, 184, 166, 0.18)",
    boxShadow: selected ? "0 0 0 4px rgba(20, 184, 166, 0.16)" : "0 0 0 3px rgba(20, 184, 166, 0.1)",
    cursor: "pointer",
    zIndex: 4,
  };
}

export function renderArcTrackPlacementAffordances(input: {
  board: Extract<EditorSceneEntity, { kind: "board" }>;
  onSelectEndpoint?: (endpointKey: "start" | "end") => void;
  selectedEndpointKey?: "start" | "end" | null;
  viewport: UnitViewport;
}): ReactElement[] {
  const endpoints = getBoardArcEndpoints(input.board);

  return (["start", "end"] as const).map((endpointKey) => {
    const center = projectAuthoringPointToScreen(endpoints[endpointKey].point, input.viewport);
    const isSelected = input.selectedEndpointKey === endpointKey;

    return (
      <button
        key={`arc-endpoint-${input.board.id}-${endpointKey}`}
        aria-label={`Select ${endpointKey} arc endpoint`}
        data-selected={String(isSelected)}
        data-testid={`scene-constraint-arc-endpoint-${endpointKey}-${input.board.id}`}
        type="button"
        onClick={() => input.onSelectEndpoint?.(endpointKey)}
        style={createArcEndpointAffordanceStyle(center, isSelected)}
      />
    );
  });
}
