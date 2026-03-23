import { useEffect, useState, type CSSProperties } from "react";

import type { RuntimeBridgeStatus } from "../../state/runtimeBridge";

export type TransportTimelineProgressView = {
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  canSeek: boolean;
  preparingProgress: number | null;
  status: RuntimeBridgeStatus;
};

type TransportTimelineProps = {
  progress: TransportTimelineProgressView;
  onSeek?: (timeSeconds: number) => void;
};

const containerStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid rgba(17, 37, 64, 0.08)",
  background: "rgba(247, 249, 252, 0.92)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "10px",
};

const inputStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#112540",
  padding: "8px 10px",
  fontSize: "13px",
};

const hintStyle: CSSProperties = {
  color: "#5a6d88",
  fontSize: "12px",
};

function formatSeconds(timeSeconds: number): string {
  return timeSeconds.toFixed(2);
}

function clampSeconds(timeSeconds: number, totalDurationSeconds: number): number {
  return Math.max(0, Math.min(timeSeconds, totalDurationSeconds));
}

export function TransportTimeline(props: TransportTimelineProps) {
  const { progress, onSeek } = props;
  const [draftTime, setDraftTime] = useState(() => formatSeconds(progress.currentTimeSeconds));

  useEffect(() => {
    setDraftTime(formatSeconds(progress.currentTimeSeconds));
  }, [progress.currentTimeSeconds]);

  function commitSeek(nextValue: string) {
    if (!progress.canSeek || !onSeek) {
      setDraftTime(formatSeconds(progress.currentTimeSeconds));
      return;
    }

    const parsed = Number.parseFloat(nextValue);

    if (!Number.isFinite(parsed)) {
      setDraftTime(formatSeconds(progress.currentTimeSeconds));
      return;
    }

    const clamped = clampSeconds(parsed, progress.totalDurationSeconds);

    setDraftTime(formatSeconds(clamped));
    onSeek(clamped);
  }

  return (
    <div style={containerStyle}>
      <div style={rowStyle}>
        <strong style={{ color: "#17304f", fontSize: "13px" }}>
          {formatSeconds(progress.currentTimeSeconds)} / {formatSeconds(progress.totalDurationSeconds)} s
        </strong>
        {progress.status === "preparing" && progress.preparingProgress !== null ? (
          <span
            data-testid="transport-preparing-progress"
            style={{ color: "#1d4ed8", fontSize: "12px", fontWeight: 600 }}
          >
            Preparing {Math.round(progress.preparingProgress * 100)}%
          </span>
        ) : null}
      </div>

      <input
        aria-label="Playback timeline"
        max={progress.totalDurationSeconds}
        min={0}
        step={1 / 60}
        style={{ width: "100%" }}
        type="range"
        value={progress.currentTimeSeconds}
        disabled={!progress.canSeek}
        onChange={(event) => {
          if (!progress.canSeek || !onSeek) {
            return;
          }

          onSeek(Number(event.currentTarget.value));
        }}
      />

      <div style={rowStyle}>
        <label style={{ display: "grid", gap: "4px" }}>
          <span style={{ color: "#17304f", fontSize: "12px", fontWeight: 600 }}>
            Jump to time
          </span>
          <input
            aria-label="Jump to time"
            inputMode="decimal"
            min={0}
            step={1 / 60}
            style={{ ...inputStyle, width: "120px" }}
            type="number"
            value={draftTime}
            disabled={!progress.canSeek}
            onBlur={(event) => {
              commitSeek(event.currentTarget.value);
            }}
            onChange={(event) => {
              setDraftTime(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitSeek((event.currentTarget as HTMLInputElement).value);
              }
            }}
          />
        </label>

        <span style={hintStyle}>
          {progress.canSeek
            ? "Drag the timeline or type a target time."
            : "Seek unlocks after cached playback is ready."}
        </span>
      </div>
    </div>
  );
}
