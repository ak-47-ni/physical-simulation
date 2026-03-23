import type { CSSProperties } from "react";

import {
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeBridgeBlockReason,
  type RuntimeBridgeBlockedAction,
  type RuntimeBridgeStatus,
  type RuntimePlaybackMode,
} from "../state/runtimeBridge";
import { RuntimeStatusBanner } from "./RuntimeStatusBanner";
import {
  TransportTimeline,
  type TransportTimelineProgressView,
} from "./transport/TransportTimeline";

export const DEFAULT_TIME_SCALE_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

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

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#112540",
  padding: "10px 14px",
  fontSize: "13px",
  cursor: "pointer",
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

function readTransportStateCopy(runtime: BottomTransportRuntimeView): string {
  if (runtime.lastErrorMessage) {
    return "Runtime needs attention. Review the runtime message above.";
  }

  if (runtime.lastBlockedAction || runtime.blockReason === "rebuild-required") {
    return "Resume blocked until rebuild";
  }

  if (runtime.status === "preparing") {
    return "Cached playback is building. Timeline scrubbing unlocks after preparation.";
  }

  if (runtime.status === "running" && runtime.playbackMode === "precomputed") {
    return "Cached playback is running. Pause to scrub or type a target time.";
  }

  if (runtime.status === "running") {
    return "Runtime is playing. Pause to inspect the current motion.";
  }

  if (runtime.status === "paused" && runtime.playbackMode === "precomputed" && runtime.canSeek) {
    return "Cached playback is paused. Drag the timeline or enter a time to inspect.";
  }

  if (runtime.status === "paused" && runtime.currentTimeSeconds > 0) {
    return "Runtime is paused on the current frame.";
  }

  return `State: ${runtime.status}`;
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

export function BottomTransportBar(props: BottomTransportBarProps) {
  const {
    runtime,
    onPause,
    onPlaybackModeChange,
    onPrecomputeDurationChange,
    onReset,
    onSeek,
    onStart,
    onStep,
    onTimeScaleChange,
  } = props;
  const showPlaybackControls = props.showPlaybackControls ?? true;
  const playbackSettings = props.playbackSettings ?? createFallbackPlaybackSettings(runtime);
  const timeScalePresets = props.timeScalePresets ?? DEFAULT_TIME_SCALE_PRESETS;
  const blockedMessage =
    runtime.lastBlockedAction?.message ??
    (runtime.blockReason === "rebuild-required"
      ? "Rebuild required before starting runtime."
      : undefined);
  const stepTitle =
    runtime.status === "running" || runtime.status === "preparing"
      ? "Pause the runtime before stepping."
      : blockedMessage;
  const transportStateCopy = readTransportStateCopy(runtime);
  const timelineProgress = createTimelineProgress(runtime);

  return (
    <div data-testid="bottom-transport-bar" style={cardStyle}>
      <RuntimeStatusBanner runtime={runtime} />

      <div style={rowStyle}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            style={buttonStyle}
            disabled={!runtime.canResume}
            title={blockedMessage}
            onClick={onStart}
          >
            Start
          </button>
          <button type="button" style={buttonStyle} onClick={onPause}>
            Pause
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={
              runtime.status === "running" ||
              runtime.status === "preparing" ||
              runtime.blockReason !== null
            }
            title={stepTitle}
            onClick={onStep}
          >
            Step
          </button>
          <button type="button" style={buttonStyle} onClick={onReset}>
            Reset
          </button>
        </div>

        <strong style={{ color: "#17304f", fontSize: "14px" }}>
          {runtime.currentTimeSeconds.toFixed(2)} s
        </strong>
      </div>

      {showPlaybackControls ? (
        <>
          <div style={rowStyle}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
              <label style={fieldStyle}>
                <span style={{ color: "#17304f", fontSize: "12px", fontWeight: 600 }}>
                  Playback mode
                </span>
                <select
                  aria-label="Playback mode"
                  style={{ ...inputStyle, minWidth: "160px" }}
                  value={playbackSettings.mode}
                  onChange={(event) => {
                    onPlaybackModeChange?.(event.currentTarget.value as RuntimePlaybackMode);
                  }}
                >
                  <option value="realtime">Realtime</option>
                  <option value="precomputed">Precomputed</option>
                </select>
              </label>

              {playbackSettings.mode === "precomputed" ? (
                <label style={fieldStyle}>
                  <span style={{ color: "#17304f", fontSize: "12px", fontWeight: 600 }}>
                    Precompute duration
                  </span>
                  <input
                    aria-label="Precompute duration"
                    min={1 / 60}
                    step={1}
                    style={{ ...inputStyle, width: "132px" }}
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
              ) : (
                <span style={{ color: "#17304f", fontSize: "13px", fontWeight: 600 }}>
                  Realtime cap {playbackSettings.realtimeDurationCapSeconds.toFixed(2)} s
                </span>
              )}
            </div>

            <span
              data-testid="transport-state-copy"
              style={{ color: "#5a6d88", fontSize: "13px" }}
            >
              {transportStateCopy}
            </span>
          </div>

          <TransportTimeline progress={timelineProgress} onSeek={onSeek} />
        </>
      ) : null}

      <div style={rowStyle}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {timeScalePresets.map((preset) => {
            const active = preset === runtime.timeScale;

            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                style={{
                  ...buttonStyle,
                  background: active ? "#112540" : "#ffffff",
                  color: active ? "#f7f9fc" : "#112540",
                }}
                onClick={() => onTimeScaleChange(preset)}
              >
                {preset}x
              </button>
            );
          })}
        </div>

        {showPlaybackControls ? null : (
          <span
            data-testid="transport-state-copy"
            style={{ color: "#5a6d88", fontSize: "13px" }}
          >
            {transportStateCopy}
          </span>
        )}
      </div>
    </div>
  );
}
