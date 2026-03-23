import type { CSSProperties } from "react";

import {
  BottomTransportBar,
  type BottomTransportRuntimeView,
} from "./BottomTransportBar";

export type PlaybackMode = "realtime" | "precomputed";

type PlaybackTransportDeckProps = {
  currentTimeSeconds: number;
  isPreparing: boolean;
  mode: PlaybackMode;
  onModeChange: (mode: PlaybackMode) => void;
  onPause: () => void;
  onPrecomputeDurationChange: (durationSeconds: number) => void;
  onReset: () => void;
  onSeek: (timeSeconds: number) => void;
  onStart: () => void;
  onStep: () => void;
  onTimeScaleChange: (timeScale: number) => void;
  precomputeDurationSeconds: number;
  preparationProgress: number;
  realtimeCapSeconds: number;
  runtime: BottomTransportRuntimeView;
  seekEnabled: boolean;
  timelineMaxSeconds: number;
};

const deckStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const settingsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  padding: "14px 16px",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(108, 128, 173, 0.18)",
};

const fieldRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#17304f",
  fontSize: "13px",
};

const inputStyle: CSSProperties = {
  border: "1px solid rgba(104, 124, 165, 0.24)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#112540",
  padding: "8px 10px",
  fontSize: "13px",
};

const timelineCardStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "14px 16px",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(108, 128, 173, 0.18)",
};

const metaCopyStyle: CSSProperties = {
  color: "#5a6d88",
  fontSize: "13px",
};

function clampTime(value: number, maxSeconds: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(maxSeconds, value));
}

export function PlaybackTransportDeck(props: PlaybackTransportDeckProps) {
  const {
    currentTimeSeconds,
    isPreparing,
    mode,
    onModeChange,
    onPause,
    onPrecomputeDurationChange,
    onReset,
    onSeek,
    onStart,
    onStep,
    onTimeScaleChange,
    precomputeDurationSeconds,
    preparationProgress,
    realtimeCapSeconds,
    runtime,
    seekEnabled,
    timelineMaxSeconds,
  } = props;
  const controlsLocked = isPreparing || runtime.status === "running";
  const clampedTimeSeconds = clampTime(currentTimeSeconds, timelineMaxSeconds);
  const progressCopy =
    mode === "precomputed"
      ? isPreparing
        ? `Preparing cache… ${Math.round(preparationProgress * 100)}%`
        : seekEnabled
          ? `Cached playback ready: ${timelineMaxSeconds.toFixed(0)} s`
          : "Build the cache to enable seeking."
      : `Realtime cap: ${realtimeCapSeconds} s`;

  return (
    <section data-testid="playback-transport-deck" style={deckStyle}>
      <div style={settingsRowStyle}>
        <div style={fieldRowStyle}>
          <label style={fieldStyle}>
            <span>Playback mode</span>
            <select
              aria-label="Playback mode"
              disabled={controlsLocked}
              style={inputStyle}
              value={mode}
              onChange={(event) => onModeChange(event.target.value as PlaybackMode)}
            >
              <option value="realtime">Realtime</option>
              <option value="precomputed">Precomputed</option>
            </select>
          </label>

          {mode === "precomputed" ? (
            <label style={fieldStyle}>
              <span>Precompute duration</span>
              <input
                aria-label="Precompute duration"
                disabled={controlsLocked}
                max={120}
                min={0.5}
                step={0.5}
                style={{ ...inputStyle, width: "120px" }}
                type="number"
                value={precomputeDurationSeconds}
                onChange={(event) => {
                  const nextDuration = Number(event.target.value);

                  if (Number.isFinite(nextDuration) && nextDuration > 0) {
                    onPrecomputeDurationChange(nextDuration);
                  }
                }}
              />
            </label>
          ) : null}
        </div>

        <span style={metaCopyStyle}>{progressCopy}</span>
      </div>

      <BottomTransportBar
        runtime={runtime}
        onPause={onPause}
        onReset={onReset}
        onStart={onStart}
        onStep={onStep}
        onTimeScaleChange={onTimeScaleChange}
      />

      <div style={timelineCardStyle}>
        <label style={fieldStyle}>
          <span>Playback progress</span>
          <input
            aria-label="Playback progress"
            data-testid="playback-progress-slider"
            disabled={!seekEnabled}
            max={timelineMaxSeconds}
            min={0}
            step={1 / 60}
            style={{ width: "100%" }}
            type="range"
            value={clampedTimeSeconds}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </label>

        <div style={fieldRowStyle}>
          <label style={fieldStyle}>
            <span>Playback time</span>
            <input
              aria-label="Playback time"
              disabled={!seekEnabled}
              max={timelineMaxSeconds}
              min={0}
              step={0.01}
              style={{ ...inputStyle, width: "120px" }}
              type="number"
              value={Number(clampedTimeSeconds.toFixed(2))}
              onChange={(event) => onSeek(Number(event.target.value))}
            />
          </label>

          {mode === "realtime" ? <strong>Realtime cap: {realtimeCapSeconds} s</strong> : null}
        </div>
      </div>
    </section>
  );
}
