import type { CSSProperties } from "react";

import { useI18n } from "../i18n";
import { localizeSystemCopy } from "../localizeSystemCopy";
import {
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeBridgeBlockReason,
  type RuntimeBridgeBlockedAction,
  type RuntimeBridgeStatus,
  type RuntimePlaybackMode,
} from "../state/runtimeBridge";
import { RuntimeStatusBanner } from "./RuntimeStatusBanner";
import { TransportSpeedSelect } from "./transport/TransportSpeedSelect";
import {
  TransportTimeline,
  type TransportTimelineProgressView,
} from "./transport/TransportTimeline";

export const DEFAULT_TIME_SCALE_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

export type BottomTransportBarLayout = "default" | "compact";

export type BottomTransportRuntimeView = {
  status: RuntimeBridgeStatus;
  currentTimeSeconds: number;
  timeScale: number;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
  lastErrorMessage: string | null;
  lastBlockedAction: RuntimeBridgeBlockedAction | null;
  playbackMode: RuntimePlaybackMode;
  totalDurationSeconds: number;
  preparingProgress: number | null;
  canSeek: boolean;
};

export type BottomTransportPlaybackSettings = {
  mode: RuntimePlaybackMode;
  precomputeDurationSeconds: number;
  realtimeDurationCapSeconds: number;
};

type BottomTransportBarProps = {
  layout?: BottomTransportBarLayout;
  runtime: BottomTransportRuntimeView;
  playbackSettings?: BottomTransportPlaybackSettings;
  showPlaybackControls?: boolean;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onTimeScaleChange: (timeScale: number) => void;
  onPlaybackModeChange?: (mode: RuntimePlaybackMode) => void;
  onPrecomputeDurationChange?: (durationSeconds: number) => void;
  onSeek?: (timeSeconds: number) => void;
  timeScalePresets?: readonly number[];
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "12px",
};

const compactRowStyle: CSSProperties = {
  ...rowStyle,
  alignItems: "end",
};

const fieldGroupStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "end",
};

const buttonGroupStyle: CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  alignItems: "center",
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#112540",
  padding: "10px 14px",
  fontSize: "13px",
  cursor: "pointer",
};

const compactButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: "7px 12px",
  fontSize: "12px",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
};

const inputStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#112540",
  padding: "8px 10px",
  fontSize: "13px",
};

const compactPreparingBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid rgba(37, 99, 235, 0.18)",
  background: "rgba(239, 246, 255, 0.92)",
  color: "#1d4ed8",
  padding: "7px 12px",
  fontSize: "12px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

function readTransportStateCopy(
  runtime: BottomTransportRuntimeView,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (runtime.lastErrorMessage) {
    return t("transport.state.runtimeNeedsAttention");
  }

  if (runtime.blockReason === "rebuild-required") {
    return t("transport.state.resultsOutOfDate");
  }

  if (runtime.lastBlockedAction) {
    return localizeSystemCopy(runtime.lastBlockedAction.message, t) ?? runtime.lastBlockedAction.message;
  }

  if (runtime.status === "preparing") {
    return t("transport.state.calculatingUnlock");
  }

  if (runtime.status === "running" && runtime.playbackMode === "precomputed") {
    return t("transport.state.showingCalculatedResult");
  }

  if (runtime.status === "running") {
    return t("transport.state.runtimePlaying");
  }

  if (runtime.status === "paused" && runtime.playbackMode === "precomputed" && runtime.canSeek) {
    return t("transport.state.resultReady");
  }

  if (runtime.playbackMode === "precomputed" && !runtime.canSeek) {
    return t("transport.state.calculateToEnable");
  }

  if (runtime.status === "paused" && runtime.currentTimeSeconds > 0) {
    return t("transport.state.runtimePaused");
  }

  return t("transport.state.statusFallback", { status: runtime.status });
}

function createFallbackPlaybackSettings(
  runtime: BottomTransportRuntimeView,
): BottomTransportPlaybackSettings {
  return {
    mode: runtime.playbackMode,
    precomputeDurationSeconds:
      runtime.playbackMode === "precomputed"
        ? runtime.totalDurationSeconds
        : DEFAULT_PRECOMPUTED_DURATION_SECONDS,
    realtimeDurationCapSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  };
}

function createTimelineProgress(runtime: BottomTransportRuntimeView): TransportTimelineProgressView {
  return {
    currentTimeSeconds: runtime.currentTimeSeconds,
    totalDurationSeconds: runtime.totalDurationSeconds,
    canSeek: runtime.canSeek,
    preparingProgress: runtime.preparingProgress,
    status: runtime.status,
  };
}

function shouldShowCompactBanner(runtime: BottomTransportRuntimeView): boolean {
  return (
    runtime.lastErrorMessage !== null ||
    runtime.lastBlockedAction !== null ||
    runtime.blockReason === "rebuild-required" ||
    runtime.status === "preparing" ||
    (runtime.playbackMode === "precomputed" && !runtime.canSeek)
  );
}

function readPreparingProgressLabel(
  runtime: BottomTransportRuntimeView,
  t: ReturnType<typeof useI18n>["t"],
): string | null {
  if (
    runtime.status !== "preparing" ||
    runtime.playbackMode !== "precomputed" ||
    runtime.preparingProgress === null
  ) {
    return null;
  }

  return t("transport.preparingProgress", {
    progress: Math.round(runtime.preparingProgress * 100),
  });
}

export function BottomTransportBar(props: BottomTransportBarProps) {
  const { t } = useI18n();
  const {
    onPause,
    onPrecomputeDurationChange,
    onReset,
    onSeek,
    onStart,
    onStep,
    onTimeScaleChange,
    runtime,
  } = props;
  const layout = props.layout ?? "default";
  const isCompactLayout = layout === "compact";
  const showPlaybackControls = props.showPlaybackControls ?? true;
  const playbackSettings = props.playbackSettings ?? createFallbackPlaybackSettings(runtime);
  const timeScalePresets = props.timeScalePresets ?? DEFAULT_TIME_SCALE_PRESETS;
  const hasCalculatedResult = runtime.playbackMode === "precomputed" && runtime.canSeek;
  const blockedMessage =
    (runtime.lastBlockedAction?.message
      ? localizeSystemCopy(runtime.lastBlockedAction.message, t)
      : undefined) ??
    (runtime.blockReason === "rebuild-required"
      ? t("transport.state.resultsOutOfDate")
      : undefined);
  const stepTitle =
    runtime.status === "running" || runtime.status === "preparing"
      ? t("transport.stepDisabledWhileRunning")
      : blockedMessage;
  const transportStateCopy = readTransportStateCopy(runtime, t);
  const timelineProgress = createTimelineProgress(runtime);
  const preparingProgressLabel = readPreparingProgressLabel(runtime, t);
  const primaryActionLabel =
    runtime.playbackMode === "precomputed"
      ? runtime.status === "preparing"
        ? t("transport.primary.calculating")
        : runtime.blockReason === "rebuild-required"
          ? t("transport.primary.recalculate")
          : hasCalculatedResult
            ? t("transport.primary.playResult")
            : t("transport.primary.calculate")
      : t("transport.primary.start");
  const currentTimeReadout = (
    <strong
      style={{
        color: "#17304f",
        fontSize: isCompactLayout ? "13px" : "14px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {runtime.currentTimeSeconds.toFixed(2)} s
    </strong>
  );

  const transportButtons = (
    <div style={buttonGroupStyle}>
      <button
        type="button"
        style={isCompactLayout ? compactButtonStyle : buttonStyle}
        disabled={
          runtime.status === "preparing" ||
          (runtime.playbackMode === "realtime" && !runtime.canResume)
        }
        title={
          runtime.playbackMode === "realtime" && !runtime.canResume ? blockedMessage : undefined
        }
        onClick={onStart}
      >
        {primaryActionLabel}
      </button>
      <button
        type="button"
        style={isCompactLayout ? compactButtonStyle : buttonStyle}
        disabled={runtime.status === "preparing"}
        onClick={onPause}
      >
        {t("transport.pause")}
      </button>
      <button
        type="button"
        style={isCompactLayout ? compactButtonStyle : buttonStyle}
        disabled={
          runtime.status === "running" ||
          runtime.status === "preparing" ||
          runtime.blockReason !== null ||
          (runtime.playbackMode === "precomputed" && !hasCalculatedResult)
        }
        title={stepTitle}
        onClick={onStep}
      >
        {t("transport.step")}
      </button>
      <button
        type="button"
        style={isCompactLayout ? compactButtonStyle : buttonStyle}
        onClick={onReset}
      >
        {t("transport.reset")}
      </button>
    </div>
  );

  const playbackFields = showPlaybackControls ? (
    <div style={fieldGroupStyle}>
      {playbackSettings.mode === "precomputed" ? (
        <label style={fieldStyle}>
          <span style={{ color: "#17304f", fontSize: "12px", fontWeight: 600 }}>
            {t("transport.field.precomputeDuration")}
          </span>
          <input
            aria-label={t("transport.field.precomputeDuration")}
            min={1 / 60}
            step={1}
            style={{
              ...inputStyle,
              width: isCompactLayout ? "110px" : "132px",
              padding: isCompactLayout ? "7px 9px" : inputStyle.padding,
              fontSize: isCompactLayout ? "12px" : inputStyle.fontSize,
            }}
            type="number"
            value={playbackSettings.precomputeDurationSeconds}
            onChange={(event) => {
              const nextValue = Number(event.currentTarget.value);

              if (Number.isFinite(nextValue)) {
                onPrecomputeDurationChange?.(nextValue);
              }
            }}
          />
        </label>
      ) : isCompactLayout ? null : (
        <span style={{ color: "#17304f", fontSize: "13px", fontWeight: 600 }}>
          {t("transport.field.realtimeCap", {
            duration: `${playbackSettings.realtimeDurationCapSeconds.toFixed(2)} s`,
          })}
        </span>
      )}
    </div>
  ) : null;

  const speedField = (
    <TransportSpeedSelect
      compact={isCompactLayout}
      presets={timeScalePresets}
      timeScale={runtime.timeScale}
      onChange={onTimeScaleChange}
    />
  );

  if (isCompactLayout) {
    return (
      <div data-testid="bottom-transport-bar" style={cardStyle}>
        {shouldShowCompactBanner(runtime) ? <RuntimeStatusBanner runtime={runtime} /> : null}

        {showPlaybackControls ? (
          <>
            <div data-testid="transport-compact-row" style={compactRowStyle}>
              {playbackFields}
              <div style={{ ...fieldGroupStyle, marginLeft: "auto" }}>
                {transportButtons}
                {preparingProgressLabel ? (
                  <span
                    aria-live="polite"
                    data-testid="transport-compact-preparing-badge"
                    style={compactPreparingBadgeStyle}
                  >
                    {preparingProgressLabel}
                  </span>
                ) : null}
                {speedField}
                {currentTimeReadout}
              </div>
            </div>

            <TransportTimeline layout="compact" progress={timelineProgress} onSeek={onSeek} />
          </>
        ) : (
          <div data-testid="transport-compact-row" style={compactRowStyle}>
            <div style={fieldGroupStyle}>
              {transportButtons}
              {speedField}
            </div>
            {currentTimeReadout}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid="bottom-transport-bar" style={cardStyle}>
      <RuntimeStatusBanner runtime={runtime} />

      <div style={rowStyle}>
        {transportButtons}
        {currentTimeReadout}
      </div>

      {showPlaybackControls ? (
        <>
          <div style={rowStyle}>{playbackFields}</div>

          <TransportTimeline progress={timelineProgress} onSeek={onSeek} />

          <div style={rowStyle}>
            {speedField}
            <span data-testid="transport-state-copy" style={{ color: "#5a6d88", fontSize: "13px" }}>
              {transportStateCopy}
            </span>
          </div>
        </>
      ) : (
        <div style={rowStyle}>
          {speedField}
          <span data-testid="transport-state-copy" style={{ color: "#5a6d88", fontSize: "13px" }}>
            {transportStateCopy}
          </span>
        </div>
      )}
    </div>
  );
}
