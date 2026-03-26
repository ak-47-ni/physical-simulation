import type { CSSProperties } from "react";

import { projectAuthoringPointToScreen, type UnitViewport } from "./unitViewport";

type SceneDomainOverlayItem = {
  style: CSSProperties;
  testId: string;
};

export type SceneDomainOverlay = {
  invalidRegions: SceneDomainOverlayItem[];
  xAxis: SceneDomainOverlayItem;
  yAxis: SceneDomainOverlayItem;
};

const AXIS_COLOR = "rgba(29, 78, 216, 0.55)";
const INVALID_REGION_FILL = "rgba(148, 163, 184, 0.12)";

export function createSceneDomainOverlay(viewport: UnitViewport): SceneDomainOverlay {
  const origin = projectAuthoringPointToScreen({ x: 0, y: 0 }, viewport);
  const invalidRegions: SceneDomainOverlayItem[] = [];

  if (origin.x > 0) {
    invalidRegions.push({
      testId: "workspace-domain-invalid-left",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: `${origin.x}px`,
        background: INVALID_REGION_FILL,
        pointerEvents: "none",
        zIndex: 0,
      },
    });
  }

  if (origin.y > 0) {
    invalidRegions.push({
      testId: "workspace-domain-invalid-top",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        height: `${origin.y}px`,
        background: INVALID_REGION_FILL,
        pointerEvents: "none",
        zIndex: 0,
      },
    });
  }

  return {
    invalidRegions,
    xAxis: {
      testId: "workspace-domain-axis-x",
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        top: `${origin.y}px`,
        height: "2px",
        background: AXIS_COLOR,
        boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.35)",
        pointerEvents: "none",
        zIndex: 0,
      },
    },
    yAxis: {
      testId: "workspace-domain-axis-y",
      style: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${origin.x}px`,
        width: "2px",
        background: AXIS_COLOR,
        boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.35)",
        pointerEvents: "none",
        zIndex: 0,
      },
    },
  };
}
