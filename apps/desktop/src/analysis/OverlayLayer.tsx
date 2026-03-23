import type { CSSProperties } from "react";

import type { AnalyzerOverlayState } from "./useAnalyzerState";

type OverlayLayerProps = {
  overlays: AnalyzerOverlayState;
};

const badgeStyle: CSSProperties = {
  borderRadius: "999px",
  background: "#eaf1ff",
  color: "#18314f",
  padding: "6px 10px",
  fontSize: "12px",
  border: "1px solid rgba(108, 128, 173, 0.16)",
};

export function OverlayLayer(props: OverlayLayerProps) {
  const { overlays } = props;

  return (
    <div data-testid="overlay-layer" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {overlays.showTrajectories ? (
        <span data-testid="trajectory-overlay" style={badgeStyle}>
          Trajectories visible
        </span>
      ) : null}
      {overlays.showVelocityVectors ? (
        <span data-testid="velocity-vector-overlay" style={badgeStyle}>
          Velocity vectors visible
        </span>
      ) : null}
      {overlays.showForceVectors ? (
        <span data-testid="force-vector-overlay" style={badgeStyle}>
          Force vectors visible
        </span>
      ) : null}
    </div>
  );
}
