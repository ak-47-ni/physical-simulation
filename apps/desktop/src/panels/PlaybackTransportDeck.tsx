import type { CSSProperties } from "react";

import {
  BottomTransportBar,
  DEFAULT_TIME_SCALE_PRESETS,
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

const topRowStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "14px 16px",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(108, 128, 173, 0.18)",
};

const settingsRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "end",
  gap: "12px",
  flexWrap: "wrap",
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
  justifySelf: "start",
  width: "min(100%, 640px)",
};

function clampTime(value: number, maxSeconds: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(maxSeconds, value));
}

function formatTimeScaleOption(preset: number): string {
  return `${preset}x`;
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
    runtime,
    seekEnabled,
    timelineMaxSeconds,
  } = props;
  const controlsLocked = isPreparing || runtime.status === "running";
  const clampedTimeSeconds = clampTime(currentTimeSeconds, timelineMaxSeconds);

  return (
    <section data-testid="playback-transport-deck" style={deckStyle}>
      <div data-testid="playback-transport-top-row" style={topRowStyle}>
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

          <label style={fieldStyle}>
            <span>Speed</span>
            <select
              aria-label="Speed"
              disabled={runtime.status === "preparing"}
              style={{ ...inputStyle, width: "112px" }}
              value={String(runtime.timeScale)}
              onChange={(event) => onTimeScaleChange(Number(event.target.value))}
            >
              {DEFAULT_TIME_SCALE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {formatTimeScaleOption(preset)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <BottomTransportBar
          runtime={runtime}
          showPlaybackControls={false}
          timeScalePresets={[]}
          onPause={onPause}
          onReset={onReset}
          onStart={onStart}
          onStep={onStep}
          onTimeScaleChange={onTimeScaleChange}
        />
      </div>

      <div
        data-align="left"
        data-testid="playback-transport-progress-row"
        style={timelineCardStyle}
      >
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
        </div>
      </div>
    </section>
  );
}
