import type { CSSProperties } from "react";

import type {
  RuntimeBridgeBlockReason,
  RuntimeBridgeBlockedAction,
  RuntimeBridgeStatus,
} from "../state/runtimeBridge";
import { RuntimeStatusBanner } from "./RuntimeStatusBanner";

export const DEFAULT_TIME_SCALE_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

export type BottomTransportRuntimeView = {
  status: RuntimeBridgeStatus;
  currentTimeSeconds: number;
  timeScale: number;
  canResume: boolean;
  blockReason: RuntimeBridgeBlockReason;
  lastErrorMessage: string | null;
  lastBlockedAction: RuntimeBridgeBlockedAction | null;
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

function readTransportStateCopy(runtime: BottomTransportRuntimeView): string {
  if (runtime.lastErrorMessage) {
    return "Runtime needs attention. Review the runtime message above.";
  }

  if (runtime.lastBlockedAction || runtime.blockReason === "rebuild-required") {
    return "Resume blocked until rebuild";
  }

  if (runtime.status === "running") {
    return "Runtime is playing. Pause to inspect the current motion.";
  }

  if (runtime.status === "paused" && runtime.currentTimeSeconds > 0) {
    return "Runtime is paused on the current frame.";
  }

  return `State: ${runtime.status}`;
}

export function BottomTransportBar(props: BottomTransportBarProps) {
  const { runtime, onPause, onReset, onStart, onStep, onTimeScaleChange } = props;
  const timeScalePresets = props.timeScalePresets ?? DEFAULT_TIME_SCALE_PRESETS;
  const blockedMessage =
    runtime.lastBlockedAction?.message ??
    (runtime.blockReason === "rebuild-required"
      ? "Rebuild required before starting runtime."
      : undefined);
  const stepTitle =
    runtime.status === "running"
      ? "Pause the runtime before stepping."
      : blockedMessage;
  const transportStateCopy = readTransportStateCopy(runtime);

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
            disabled={runtime.status === "running" || runtime.blockReason !== null}
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

        <span
          data-testid="transport-state-copy"
          style={{ color: "#5a6d88", fontSize: "13px" }}
        >
          {transportStateCopy}
        </span>
      </div>
    </div>
  );
}
