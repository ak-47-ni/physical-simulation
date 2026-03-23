import type { CSSProperties } from "react";

import type {
  RuntimeBridgeBlockReason,
  RuntimeBridgeStatus,
} from "../state/runtimeBridge";

export const DEFAULT_TIME_SCALE_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

export type BottomTransportRuntimeView = {
  status: RuntimeBridgeStatus;
  currentTimeSeconds: number;
  timeScale: number;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
};

type BottomTransportBarProps = {
  runtime: BottomTransportRuntimeView;
  onStart: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onTimeScaleChange: (timeScale: number) => void;
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

export function BottomTransportBar(props: BottomTransportBarProps) {
  const { runtime, onPause, onReset, onStart, onStep, onTimeScaleChange } = props;
  const timeScalePresets = props.timeScalePresets ?? DEFAULT_TIME_SCALE_PRESETS;

  return (
    <div data-testid="bottom-transport-bar" style={cardStyle}>
      <div style={rowStyle}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" style={buttonStyle} disabled={!runtime.canResume} onClick={onStart}>
            Start
          </button>
          <button type="button" style={buttonStyle} onClick={onPause}>
            Pause
          </button>
          <button
            type="button"
            style={buttonStyle}
            disabled={runtime.status === "running" || runtime.blockReason !== null}
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

        <span style={{ color: "#5a6d88", fontSize: "13px" }}>
          {runtime.blockReason === "rebuild-required"
            ? "Resume blocked until rebuild"
            : `State: ${runtime.status}`}
        </span>
      </div>
    </div>
  );
}
