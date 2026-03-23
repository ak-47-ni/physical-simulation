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
  tone: "error" | "warning";
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
        background: feedback.tone === "error" ? "#fff1f2" : "#fff7ed",
        color: feedback.tone === "error" ? "#9f1239" : "#9a3412",
        border:
          feedback.tone === "error"
            ? "1px solid rgba(190, 24, 93, 0.18)"
            : "1px solid rgba(194, 65, 12, 0.18)",
      }}
    >
      {feedback.message}
    </div>
  );
}
