import type { CSSProperties } from "react";

import { useI18n } from "../i18n";
import { localizeSystemCopy } from "../localizeSystemCopy";
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
import { buildRuntimeLiveSummary } from "./runtimeLiveSummary";
import {
  ANALYZER_METRICS,
  type AnalyzerState,
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
  playbackMode: "realtime" | "precomputed";
  sampleCount: number;
  status: ReturnType<typeof useRuntimeTrajectorySamples>["status"];
  t: ReturnType<typeof useI18n>["t"];
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
      message:
        localizeSystemCopy(input.lastBlockedActionMessage, input.t) ??
        input.lastBlockedActionMessage,
    };
  }

  if (input.blockReason === "rebuild-required") {
    return {
      tone: "warning" as const,
      message:
        input.sampleCount > 0
          ? input.t("analysis.feedback.staleSamples")
          : input.t("analysis.feedback.staleSetup"),
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
      message:
        input.playbackMode === "precomputed"
          ? input.t("analysis.feedback.noSamplesPrecomputed")
          : input.t("analysis.feedback.noSamplesRealtime"),
    };
  }

  return null;
}

function formatMetricLabel(
  metric: (typeof ANALYZER_METRICS)[number],
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (metric) {
    case "displacement":
      return t("analysis.metric.displacement");
    case "velocity":
      return t("analysis.metric.velocity");
    case "acceleration":
      return t("analysis.metric.acceleration");
    case "energy":
      return t("analysis.metric.energy");
  }
}

export function AnalysisPanel(props: AnalysisPanelProps = {}) {
  const { locale, t } = useI18n();
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
  const runtimeSnapshot = props.runtimePort?.getSnapshot().bridge ?? null;
  const runtimeSummary = buildRuntimeLiveSummary({
    currentFrame: runtimeSnapshot?.currentFrame ?? null,
    currentTimeSeconds:
      runtimeSnapshot?.currentTimeSeconds ?? trajectorySamples.at(-1)?.timeSeconds ?? 0,
    formatters: {
      currentAcceleration: (value) => t("analysis.live.currentAcceleration", { value }),
      currentAccelerationPlaceholder: () => t("analysis.live.currentAccelerationPlaceholder"),
      currentSpeed: (value) => t("analysis.live.currentSpeed", { value }),
      currentSpeedPlaceholder: () => t("analysis.live.currentSpeedPlaceholder"),
      elapsedTime: (time) => t("analysis.live.elapsedTime", { time }),
      frame: (frame) => t("analysis.live.frame", { frame }),
      framePlaceholder: () => t("analysis.live.framePlaceholder"),
      latestHeadline: (frame, time) => t("analysis.live.headline.latest", { frame, time }),
      liveSamples: (count) => t("analysis.live.liveSamples", { count }),
      noLiveDataHeadline: () => t("analysis.live.noData"),
      pausedHeadline: (frame, time) => t("analysis.live.headline.paused", { frame, time }),
      runningHeadline: (frame, time) => t("analysis.live.headline.running", { frame, time }),
    },
    status: runtimeSnapshot?.status ?? "idle",
    trajectorySamples,
  });
  const runtimeFeedback = readRuntimeAnalysisFeedback({
    blockReason: runtimeTrajectoryState.blockReason,
    error: runtimeTrajectoryState.error,
    lastBlockedActionMessage: runtimeTrajectoryState.lastBlockedActionMessage,
    lastErrorMessage: runtimeTrajectoryState.lastErrorMessage,
    playbackMode: runtimeSnapshot?.playbackMode ?? "realtime",
    sampleCount: trajectorySamples.length,
    status: runtimeTrajectoryState.status,
    t,
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
        <strong style={{ color: "#17304f" }}>{t("analysis.overlays.title")}</strong>
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
            {display.showTrajectories
              ? t("analysis.overlays.hideTrajectories")
              : t("analysis.overlays.showTrajectories")}
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
            {display.showVelocityVectors
              ? t("analysis.overlays.hideVelocityVectors")
              : t("analysis.overlays.showVelocityVectors")}
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
            {display.showForceVectors
              ? t("analysis.overlays.hideForceVectors")
              : t("analysis.overlays.showForceVectors")}
          </button>
          <button type="button" style={buttonStyle} onClick={toggleChartPanel}>
            {analysisState.overlays.chartPanelOpen
              ? t("analysis.overlays.closeChartPanel")
              : t("analysis.overlays.openChartPanel")}
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
            <strong style={{ color: "#17304f" }}>{t("analysis.runtime.title")}</strong>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {t("analysis.runtime.trackedEntity", {
                label:
                  runtimeTrajectoryState.analyzerEntityId ?? t("analysis.runtime.pendingCompileTarget"),
              })}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {t("analysis.runtime.sampleCount", { count: trajectorySamples.length })}
            </span>
            <span style={{ color: "#17304f", fontSize: "13px" }}>{runtimeSummary.headline}</span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>{runtimeSummary.frameLabel}</span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {runtimeSummary.elapsedLabel}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>{runtimeSummary.sampleLabel}</span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {runtimeSummary.speedLabel}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {runtimeSummary.accelerationLabel}
            </span>
            {runtimeFeedback ? (
              <span
                style={{
                  color:
                    runtimeFeedback.tone === "error"
                      ? "#9f1239"
                      : runtimeFeedback.tone === "warning"
                        ? "#9a3412"
                        : "#5d6f88",
                  fontSize: "13px",
                }}
              >
                {runtimeFeedback.message}
              </span>
            ) : null}
            {runtimeFeedback?.tone === "error" || runtimeFeedback?.tone === "warning" ? (
              <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                {t("analysis.runtime.teachingSamplesRemain")}
              </span>
            ) : null}
          </div>
        ) : null}

        {analysisState.overlays.chartPanelOpen ? (
          <div data-testid="analysis-chart-panel" style={cardStyle}>
            <strong style={{ color: "#17304f" }}>{t("analysis.chart.title")}</strong>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {t("analysis.chart.samplesReady", { count: availableSampleCount })}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {t("analysis.chart.selectedMetric", {
                metric:
                  locale === "en"
                    ? analysisState.selectedMetric
                    : formatMetricLabel(analysisState.selectedMetric, t),
              })}
            </span>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {t("analysis.chart.samplesInView", { count: chartSamples.length })}
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
                  {t("analysis.chart.viewMetric", {
                    metric: formatMetricLabel(metric, t),
                  })}
                </button>
              ))}
            </div>
            <span style={{ color: "#5d6f88", fontSize: "13px" }}>
              {latestChartSample
                ? t("analysis.chart.latestSample", {
                    unit: latestChartSample.unit,
                    value: latestChartSample.value,
                  })
                : t("analysis.chart.latestSampleNone")}
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
                  {t("analysis.chart.metricOverview", {
                    metric: formatMetricLabel(chartSummary.metric, t),
                  })}
                </strong>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.latest", {
                    unit: chartSummary.unit,
                    value: chartSummary.latestValue,
                  })}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.range", {
                    max: chartSummary.maxValue,
                    min: chartSummary.minValue,
                    unit: chartSummary.unit,
                  })}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.seriesPoints", { count: chartSeries.length })}
                </span>
              </div>
            ) : (
              <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                {t("analysis.chart.noSummary")}
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
                <strong style={{ color: "#17304f" }}>{t("analysis.chart.trajectoryTitle")}</strong>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.trajectorySamples", { count: trajectorySamples.length })}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.latestRuntimeTime", {
                    time: `${runtimeReadout.timeSeconds.toFixed(2)} s`,
                  })}
                </span>
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.latestPosition", {
                    x: runtimeReadout.position.x.toFixed(2),
                    y: runtimeReadout.position.y.toFixed(2),
                  })}
                </span>
                {runtimeDerivedSummary ? (
                  <>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {t("analysis.chart.runtimeDerivedPoints", {
                        count: runtimeDerivedSamples.length,
                      })}
                    </span>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {t("analysis.chart.runtimeLatestValue", {
                        unit: runtimeDerivedSummary.unit,
                        value: runtimeDerivedSummary.latestValue.toFixed(2),
                      })}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                    {t("analysis.chart.runtimeDerivedUnavailable")}
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
              <strong style={{ color: "#17304f" }}>{t("analysis.chart.keyPoints")}</strong>
              {keyPointRows.length === 0 ? (
                <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                  {t("analysis.chart.noKeyPoints")}
                </span>
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
                    <strong style={{ color: "#17304f", fontSize: "13px" }}>
                      {t("analysis.chart.point", { index: row.index })}
                    </strong>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {row.label}: {row.value} {row.unit}
                    </span>
                    <span style={{ color: "#5d6f88", fontSize: "13px" }}>
                      {row.deltaFromPrevious === null
                        ? t("analysis.chart.deltaBaseline")
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
        <strong style={{ color: "#17304f" }}>{t("analysis.probeSamples.title")}</strong>
        <div style={{ display: "grid", gap: "8px" }}>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            {t("analysis.probeSamples.label")}
            <input
              aria-label={t("analysis.probeSamples.label")}
              style={inputStyle}
              value={analysisState.draft.label}
              onChange={(event) => {
                updateDraft({ label: event.target.value });
              }}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            {t("analysis.probeSamples.metric")}
            <select
              aria-label={t("analysis.probeSamples.metric")}
              style={inputStyle}
              value={analysisState.draft.metric}
              onChange={(event) => {
                updateDraft({ metric: event.target.value as (typeof ANALYZER_METRICS)[number] });
              }}
            >
              {ANALYZER_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {formatMetricLabel(metric, t)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            {t("analysis.probeSamples.value")}
            <input
              aria-label={t("analysis.probeSamples.value")}
              style={inputStyle}
              value={analysisState.draft.value}
              onChange={(event) => {
                updateDraft({ value: event.target.value });
              }}
            />
          </label>
          <label style={{ display: "grid", gap: "4px", color: "#5d6f88", fontSize: "13px" }}>
            {t("analysis.probeSamples.unit")}
            <input
              aria-label={t("analysis.probeSamples.unit")}
              style={inputStyle}
              value={analysisState.draft.unit}
              onChange={(event) => {
                updateDraft({ unit: event.target.value });
              }}
            />
          </label>
        </div>
        <button type="button" style={buttonStyle} onClick={acceptSample}>
          {t("analysis.probeSamples.accept")}
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
                {t("analysis.probeSamples.group", {
                  count: group.samples.length,
                  metric: formatMetricLabel(group.metric, t),
                })}
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
