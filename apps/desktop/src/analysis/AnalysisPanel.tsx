import type { CSSProperties } from "react";

import type { RuntimeBridgePort } from "../state/runtimeBridge";
import {
  buildRuntimeTrajectoryReadout,
  createAnalyzerSamplesFromTrajectory,
  type RuntimeTrajectorySample,
} from "./analysisTrajectorySamples";
import {
  buildAnalyzerChartSeries,
  buildAnalyzerMetricSummaries,
} from "./analysisSummary";
import { buildAnalyzerKeyPointRows } from "./analysisKeyPoints";
import { OverlayLayer } from "./OverlayLayer";
import {
  ANALYZER_METRICS,
  type AnalyzerState,
  formatAnalyzerMetric,
  groupAnalyzerSamples,
  useAnalyzerState,
} from "./useAnalyzerState";
import { useRuntimeTrajectorySamples } from "./useRuntimeTrajectorySamples";

export type AnalysisDisplayState = {
  showTrajectories: boolean;
  showVelocityVectors: boolean;
  showForceVectors: boolean;
};

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

const runtimeSummaryStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "#ffffff",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

type AnalysisPanelProps = {
  state?: AnalyzerState;
  onStateChange?: (nextState: AnalyzerState) => void;
  display?: AnalysisDisplayState;
  onDisplayChange?: (nextDisplay: AnalysisDisplayState) => void;
  trajectorySamples?: RuntimeTrajectorySample[];
  runtimePort?: RuntimeBridgePort;
  analyzerId?: string;
};

function readRuntimeAnalysisFeedback(input: {
  blockReason: ReturnType<typeof useRuntimeTrajectorySamples>["blockReason"];
  error: string | null;
  lastBlockedActionMessage: string | null;
  lastErrorMessage: string | null;
  sampleCount: number;
  status: ReturnType<typeof useRuntimeTrajectorySamples>["status"];
}) {
  if (input.lastErrorMessage) {
    return {
      tone: "error" as const,
      message: input.lastErrorMessage,
    };
  }

  if (input.lastBlockedActionMessage) {
    return {
      tone: "warning" as const,
      message: input.lastBlockedActionMessage,
    };
  }

  if (input.blockReason === "rebuild-required") {
    return {
      tone: "warning" as const,
      message: "Rebuild required before starting runtime.",
    };
  }

  if (input.error) {
    return {
      tone: "warning" as const,
      message: input.error,
    };
  }

  if (input.sampleCount === 0 && input.status !== "idle") {
    return {
      tone: "info" as const,
      message: "No runtime samples yet. Start or step the runtime to collect data.",
    };
  }

  return null;
}

export function AnalysisPanel(props: AnalysisPanelProps = {}) {
  const {
    state: analysisState,
    acceptSample,
    selectChartMetric,
    toggleChartPanel,
    toggleForceVectors,
    toggleTrajectories,
    toggleVelocityVectors,
    updateDraft,
  } = useAnalyzerState({
    state: props.state,
    onStateChange: props.onStateChange,
  });
  const runtimeTrajectoryState = useRuntimeTrajectorySamples(
    props.trajectorySamples
      ? {}
      : {
          runtimePort: props.runtimePort,
          analyzerId: props.analyzerId,
        },
  );
  const trajectorySamples = props.trajectorySamples ?? runtimeTrajectoryState.trajectorySamples;
  const runtimeFeedback = readRuntimeAnalysisFeedback({
    blockReason: runtimeTrajectoryState.blockReason,
    error: runtimeTrajectoryState.error,
    lastBlockedActionMessage: runtimeTrajectoryState.lastBlockedActionMessage,
    lastErrorMessage: runtimeTrajectoryState.lastErrorMessage,
    sampleCount: trajectorySamples.length,
    status: runtimeTrajectoryState.status,
  });
  const showRuntimeSummary =
    Boolean(props.runtimePort && props.analyzerId) ||
    runtimeTrajectoryState.analyzerEntityId !== null ||
    trajectorySamples.length > 0 ||
    runtimeFeedback !== null;
  const groupedSamples = groupAnalyzerSamples(analysisState.samples);
  const metricSummaries = buildAnalyzerMetricSummaries(analysisState.samples);
  const manualChartSamples = analysisState.samples.filter(
    (sample) => sample.metric === analysisState.selectedMetric,
  );
  const runtimeReadout = buildRuntimeTrajectoryReadout(trajectorySamples);
  const runtimeDerivedSamples = createAnalyzerSamplesFromTrajectory(
    trajectorySamples,
    analysisState.selectedMetric,
  );
  const chartSamples =
    manualChartSamples.length > 0 ? manualChartSamples : runtimeDerivedSamples;
  const chartSeries = buildAnalyzerChartSeries(chartSamples, analysisState.selectedMetric);
  const keyPointRows = buildAnalyzerKeyPointRows(chartSamples, analysisState.selectedMetric);
  const runtimeDerivedSummary = buildAnalyzerMetricSummaries(runtimeDerivedSamples).find(
    (summary) => summary.metric === analysisState.selectedMetric,
  );
  const availableSampleCount =
    analysisState.samples.length > 0 ? analysisState.samples.length : runtimeDerivedSamples.length;
  const latestChartSample = chartSamples.at(-1);
  const selectedSummary = metricSummaries.find(
    (summary) => summary.metric === analysisState.selectedMetric,
  );
  const chartSummary = selectedSummary ?? runtimeDerivedSummary;
  const display = props.display ?? {
    showTrajectories: analysisState.overlays.showTrajectories,
    showVelocityVectors: analysisState.overlays.showVelocityVectors,
    showForceVectors: analysisState.overlays.showForceVectors,
  };

  function updateDisplay(nextDisplay: AnalysisDisplayState) {
    if (props.onDisplayChange) {
      props.onDisplayChange(nextDisplay);
      return;
    }

    if (nextDisplay.showTrajectories !== analysisState.overlays.showTrajectories) {
      toggleTrajectories();
    }
    if (nextDisplay.showVelocityVectors !== analysisState.overlays.showVelocityVectors) {
      toggleVelocityVectors();
    }
    if (nextDisplay.showForceVectors !== analysisState.overlays.showForceVectors) {
      toggleForceVectors();
    }
  }

  return (
    <div data-testid="analysis-panel" style={{ display: "grid", gap: "14px" }}>
      <section style={cardStyle}>
        <strong style={{ color: "#17304f" }}>Analysis overlays</strong>
        <div style={rowStyle}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              updateDisplay({
                ...display,
                showTrajectories: !display.showTrajectories,
              });
            }}
          >
            {display.showTrajectories ? "Hide trajectories" : "Show trajectories"}
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              updateDisplay({
                ...display,
                showVelocityVectors: !display.showVelocityVectors,
                showForceVectors: display.showForceVectors,
              });
            }}
          >
            {display.showVelocityVectors ? "Hide velocity vectors" : "Show velocity vectors"}
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              updateDisplay({
                ...display,
                showForceVectors: !display.showForceVectors,
              });
            }}
          >
            {display.showForceVectors ? "Hide force vectors" : "Show force vectors"}
          </button>
          <button type="button" style={buttonStyle} onClick={toggleChartPanel}>
            {analysisState.overlays.chartPanelOpen ? "Close chart panel" : "Open chart panel"}
          </button>
        </div>

        <OverlayLayer
          overlays={{
            ...analysisState.overlays,
            ...display,
          }}
        />

        {showRuntimeSummary ? (
          <div
            data-testid="analysis-runtime-summary"
            style={{
              ...runtimeSummaryStyle,
              background:
                runtimeFeedback?.tone === "error"
                  ? "#fff1f2"
                  : runtimeFeedback?.tone === "warning"
                    ? "#fff7ed"
                    : "#ffffff",
              border:
                runtimeFeedback?.tone === "error"
                  ? "1px solid rgba(190, 24, 93, 0.18)"
                  : runtimeFeedback?.tone === "warning"
                    ? "1px solid rgba(194, 65, 12, 0.18)"
                    : runtimeSummaryStyle.border,
            }}
          >
            <strong style={{ color: "#17304f" }}>Runtime analysis</strong>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Tracked entity: {runtimeTrajectoryState.analyzerEntityId ?? "pending compile target"}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Runtime sample count: {trajectorySamples.length}
            </span>
            <span
              style={{
                color:
                  runtimeFeedback?.tone === "error"
                    ? "#9f1239"
                    : runtimeFeedback?.tone === "warning"
                      ? "#9a3412"
                      : "#5d6f88",
                fontSize: "13px",
              }}
            >
              {runtimeFeedback?.message ?? "Runtime samples ready for charting."}
            </span>
            {runtimeFeedback?.tone === "error" || runtimeFeedback?.tone === "warning" ? (
              <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                Teaching samples stay available while runtime feedback updates.
              </span>
            ) : null}
          </div>
        ) : null}

        {analysisState.overlays.chartPanelOpen ? (
          <div data-testid="analysis-chart-panel" style={cardStyle}>
            <strong style={{ color: "#17304f" }}>Chart panel</strong>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Samples ready: {availableSampleCount}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Selected metric: {analysisState.selectedMetric}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              Samples in view: {chartSamples.length}
            </span>
            <div style={rowStyle}>
              {ANALYZER_METRICS.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  style={buttonStyle}
                  onClick={() => {
                    selectChartMetric(metric);
                  }}
                >
                  View {metric} chart
                </button>
              ))}
            </div>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {latestChartSample
                ? `Latest sample: ${latestChartSample.value} ${latestChartSample.unit}`
                : "Latest sample: none"}
            </span>
            {chartSummary ? (
              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: "#ffffff",
                  border: "1px solid rgba(108, 128, 173, 0.14)",
                }}
              >
                <strong style={{ color: "#17304f" }}>
                  {formatAnalyzerMetric(chartSummary.metric)} overview
                </strong>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Latest: {chartSummary.latestValue} {chartSummary.unit}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Range: {chartSummary.minValue} to {chartSummary.maxValue} {chartSummary.unit}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Series points: {chartSeries.length}
                </span>
              </div>
            ) : (
              <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                No metric summary yet
              </span>
            )}
            {runtimeReadout ? (
              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: "#ffffff",
                  border: "1px solid rgba(108, 128, 173, 0.14)",
                }}
              >
                <strong style={{ color: "#17304f" }}>Runtime trajectory</strong>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Trajectory samples: {trajectorySamples.length}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Latest runtime time: {runtimeReadout.timeSeconds.toFixed(2)} s
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  Latest position: {runtimeReadout.position.x.toFixed(2)},{" "}
                  {runtimeReadout.position.y.toFixed(2)}
                </span>
                {runtimeDerivedSummary ? (
                  <>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      Runtime-derived points: {runtimeDerivedSamples.length}
                    </span>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      Runtime latest value: {runtimeDerivedSummary.latestValue.toFixed(2)}{" "}
                      {runtimeDerivedSummary.unit}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                    Runtime-derived metric unavailable
                  </span>
                )}
              </div>
            ) : null}
            <div
              style={{
                display: "grid",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#ffffff",
                border: "1px solid rgba(108, 128, 173, 0.14)",
              }}
            >
              <strong style={{ color: "#17304f" }}>Key points</strong>
              {keyPointRows.length === 0 ? (
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>No key points yet</span>
              ) : (
                keyPointRows.map((row) => (
                  <div
                    key={`${analysisState.selectedMetric}-${row.index}`}
                    style={{
                      display: "grid",
                      gap: "2px",
                      padding: "8px 10px",
                      borderRadius: "10px",
                      background: "#f7f9fd",
                    }}
                  >
                    <strong style={{ color: "#17304f", fontSize: "13px" }}>Point {row.index}</strong>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {row.label}: {row.value} {row.unit}
                    </span>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {row.deltaFromPrevious === null
                        ? "Delta baseline"
                        : `${row.deltaFromPrevious > 0 ? "+" : ""}${row.deltaFromPrevious} ${row.unit}`}
                    </span>
                  </div>
                ))
              )}
            </div>
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
              value={analysisState.draft.label}
              onChange={(event) => {
                updateDraft({ label: event.target.value });
              }}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            Sample metric
            <select
              aria-label="Sample metric"
              style={inputStyle}
              value={analysisState.draft.metric}
              onChange={(event) => {
                updateDraft({ metric: event.target.value as (typeof ANALYZER_METRICS)[number] });
              }}
            >
              {ANALYZER_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {formatAnalyzerMetric(metric)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            Sample value
            <input
              aria-label="Sample value"
              style={inputStyle}
              value={analysisState.draft.value}
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
              value={analysisState.draft.unit}
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
          {groupedSamples.map((group) => (
            <section
              key={group.metric}
              style={{
                display: "grid",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#eef3fb",
                border: "1px solid rgba(108, 128, 173, 0.1)",
              }}
            >
              <strong style={{ color: "#17304f" }}>
                {formatAnalyzerMetric(group.metric)} samples ({group.samples.length})
              </strong>
              {group.samples.map((sample) => (
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
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
