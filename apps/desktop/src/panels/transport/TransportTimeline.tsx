import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { RuntimeBridgeStatus } from "../../state/runtimeBridge";

export type TransportTimelineProgressView = {
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  canSeek: boolean;
  preparingProgress: number | null;
  status: RuntimeBridgeStatus;
};

export type TransportTimelineLayout = "default" | "compact";

type TransportTimelineProps = {
  layout?: TransportTimelineLayout;
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

const compactContainerStyle: CSSProperties = {
  ...containerStyle,
  gap: "8px",
  padding: "10px 12px",
  width: "min(100%, 560px)",
  maxWidth: "560px",
  alignSelf: "start",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "10px",
};

const compactRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: "flex-start",
  gap: "12px",
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
  const { onSeek, progress } = props;
  const [draftTime, setDraftTime] = useState(() => formatSeconds(progress.currentTimeSeconds));
  const lastSliderValueRef = useRef<string | null>(null);
  const layout = props.layout ?? "default";
  const isCompactLayout = layout === "compact";

  useEffect(() => {
    setDraftTime(formatSeconds(progress.currentTimeSeconds));
    lastSliderValueRef.current = null;
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

  function emitSliderSeek(nextValue: string) {
    if (!progress.canSeek || !onSeek) {
      return;
    }

    const parsed = Number(nextValue);

    if (!Number.isFinite(parsed)) {
      return;
    }

    onSeek(clampSeconds(parsed, progress.totalDurationSeconds));
  }

  return (
    <div
      data-testid={isCompactLayout ? "transport-timeline-compact" : undefined}
      style={isCompactLayout ? compactContainerStyle : containerStyle}
    >
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

      <div data-testid={isCompactLayout ? "transport-timeline-compact-row" : undefined}>
        <input
          aria-label="Playback timeline"
          max={progress.totalDurationSeconds}
          min={0}
          step={1 / 60}
          style={{ width: "100%" }}
          type="range"
          value={progress.currentTimeSeconds}
          disabled={!progress.canSeek}
          onInput={(event) => {
            const nextValue = (event.currentTarget as HTMLInputElement).value;

            lastSliderValueRef.current = nextValue;
            emitSliderSeek(nextValue);
          }}
          onChange={(event) => {
            if (event.currentTarget.value === lastSliderValueRef.current) {
              return;
            }

            emitSliderSeek(event.currentTarget.value);
          }}
        />

        <div style={isCompactLayout ? compactRowStyle : rowStyle}>
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
    </div>
  );
}
