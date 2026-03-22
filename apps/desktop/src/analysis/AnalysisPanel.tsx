import type { CSSProperties } from "react";

import { OverlayLayer } from "./OverlayLayer";
import { useAnalyzerState } from "./useAnalyzerState";

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  borderRadius: "16px",
  background: "#f7f9fd",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
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

const inputStyle: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(108, 128, 173, 0.16)",
  padding: "8px 10px",
  fontSize: "13px",
};

export function AnalysisPanel() {
  const {
    state,
    acceptSample,
    toggleChartPanel,
    toggleForceVectors,
    toggleTrajectories,
    toggleVelocityVectors,
    updateDraft,
  } = useAnalyzerState();

  return (
    <div data-testid="analysis-panel" style={{ display: "grid", gap: "14px" }}>
      <section style={cardStyle}>
        <strong style={{ color: "#17304f" }}>Analysis overlays</strong>
        <div style={rowStyle}>
          <button type="button" style={buttonStyle} onClick={toggleTrajectories}>
            {state.overlays.showTrajectories ? "Hide trajectories" : "Show trajectories"}
          </button>
          <button type="button" style={buttonStyle} onClick={toggleVelocityVectors}>
            {state.overlays.showVelocityVectors
              ? "Hide velocity vectors"
              : "Show velocity vectors"}
          </button>
          <button type="button" style={buttonStyle} onClick={toggleForceVectors}>
            {state.overlays.showForceVectors ? "Hide force vectors" : "Show force vectors"}
          </button>
          <button type="button" style={buttonStyle} onClick={toggleChartPanel}>
            {state.overlays.chartPanelOpen ? "Close chart panel" : "Open chart panel"}
          </button>
        </div>

        <OverlayLayer overlays={state.overlays} />

        {state.overlays.chartPanelOpen ? (
          <div data-testid="analysis-chart-panel" style={cardStyle}>
            <strong style={{ color: "#17304f" }}>Chart panel</strong>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Samples ready: {state.samples.length}
            </span>
          </div>
        ) : null}
      </section>

      <section style={cardStyle}>
        <strong style={{ color: "#17304f" }}>Probe samples</strong>
        <div style={{ display: "grid", gap: "8px" }}>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            Sample label
            <input
              aria-label="Sample label"
              style={inputStyle}
              value={state.draft.label}
              onChange={(event) => {
                updateDraft({ label: event.target.value });
              }}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            Sample value
            <input
              aria-label="Sample value"
              style={inputStyle}
              value={state.draft.value}
              onChange={(event) => {
                updateDraft({ value: event.target.value });
              }}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            Sample unit
            <input
              aria-label="Sample unit"
              style={inputStyle}
              value={state.draft.unit}
              onChange={(event) => {
                updateDraft({ unit: event.target.value });
              }}
            />
          </label>
        </div>
        <button type="button" style={buttonStyle} onClick={acceptSample}>
          Accept sample
        </button>

        <div style={{ display: "grid", gap: "8px" }}>
          {state.samples.map((sample) => (
            <div
              key={sample.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#ffffff",
                border: "1px solid rgba(108, 128, 173, 0.14)",
              }}
            >
              <strong style={{ color: "#17304f" }}>{sample.label}</strong>
              <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                {sample.value} {sample.unit}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
