import type { CSSProperties } from "react";

import type {
  RuntimeBridgeBlockReason,
  RuntimeBridgeBlockedAction,
  RuntimeBridgeStatus,
} from "../state/runtimeBridge";

type RuntimeStatusBannerProps = {
  runtime: {
    status: RuntimeBridgeStatus;
    blockReason: RuntimeBridgeBlockReason;
    lastErrorMessage: string | null;
    lastBlockedAction: RuntimeBridgeBlockedAction | null;
  };
};

const bannerStyle: CSSProperties = {
  borderRadius: "12px",
  padding: "10px 12px",
  fontSize: "13px",
  lineHeight: 1.5,
};

function readBannerMessage(runtime: RuntimeStatusBannerProps["runtime"]): {
  tone: "error" | "warning" | "info";
  message: string;
} | null {
  if (runtime.lastErrorMessage) {
    return {
      tone: "error",
      message: runtime.lastErrorMessage,
    };
  }

  if (runtime.lastBlockedAction) {
    return {
      tone: "warning",
      message: runtime.lastBlockedAction.message,
    };
  }

  if (runtime.blockReason === "rebuild-required") {
    return {
      tone: "warning",
      message: "Rebuild required before starting runtime.",
    };
  }

  if (runtime.status === "running") {
    return {
      tone: "info",
      message: "Runtime is playing. Motion and live samples should keep updating.",
    };
  }

  if (runtime.status === "paused") {
    return {
      tone: "info",
      message: "Runtime is paused. Use Step for one frame or Start to continue.",
    };
  }

  return null;
}

export function RuntimeStatusBanner(props: RuntimeStatusBannerProps) {
  const feedback = readBannerMessage(props.runtime);

  if (!feedback) {
    return null;
  }

  return (
    <div
      data-testid="runtime-status-banner"
      role="status"
      aria-live="polite"
      style={{
        ...bannerStyle,
        background:
          feedback.tone === "error"
            ? "#fff1f2"
            : feedback.tone === "warning"
              ? "#fff7ed"
              : "#eff6ff",
        color:
          feedback.tone === "error"
            ? "#9f1239"
            : feedback.tone === "warning"
              ? "#9a3412"
              : "#1d4ed8",
        border:
          feedback.tone === "error"
            ? "1px solid rgba(190, 24, 93, 0.18)"
            : feedback.tone === "warning"
              ? "1px solid rgba(194, 65, 12, 0.18)"
              : "1px solid rgba(37, 99, 235, 0.18)",
      }}
    >
      {feedback.message}
    </div>
  );
}
