import type { CSSProperties } from "react";

import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const { overlays } = props;

  return (
    <div data-testid="overlay-layer" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <span data-testid="rigid-boundary-overlay" style={badgeStyle}>
        {t("analysis.overlay.rigidBoundary")}
      </span>
      {overlays.showTrajectories ? (
        <span data-testid="trajectory-overlay" style={badgeStyle}>
          {t("analysis.overlay.trajectoriesVisible")}
        </span>
      ) : null}
      {overlays.showVelocityVectors ? (
        <span data-testid="velocity-vector-overlay" style={badgeStyle}>
          {t("analysis.overlay.velocityVectorsVisible")}
        </span>
      ) : null}
      {overlays.showForceVectors ? (
        <span data-testid="force-vector-overlay" style={badgeStyle}>
          {t("analysis.overlay.forceVectorsVisible")}
        </span>
      ) : null}
    </div>
  );
}
