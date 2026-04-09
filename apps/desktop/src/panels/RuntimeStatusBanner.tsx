import type { CSSProperties } from "react";

import type {
  RuntimeBridgeBlockReason,
  RuntimeBridgeBlockedAction,
  RuntimeBridgeStatus,
  RuntimePlaybackMode,
} from "../state/runtimeBridge";

type RuntimeStatusBannerProps = {
  runtime: {
    status: RuntimeBridgeStatus;
    blockReason: RuntimeBridgeBlockReason;
    lastErrorMessage: string | null;
    lastBlockedAction: RuntimeBridgeBlockedAction | null;
    playbackMode: RuntimePlaybackMode;
    canSeek: boolean;
  };
};

const bannerStyle: CSSProperties = {
  borderRadius: "12px",
  padding: "10px 12px",
  fontSize: "13px",
  lineHeight: 1.5,
};

const elasticCollisionNote =
  "Rigid collisions stay elastic, so bounce height should stay consistent. Friction only changes sliding.";

function withElasticCollisionNote(message: string) {
  return `${message} ${elasticCollisionNote}`;
}

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

  if (runtime.blockReason === "rebuild-required") {
    return {
      tone: "warning",
      message: withElasticCollisionNote(
        "Results are out of date. Recalculate to review the latest motion.",
      ),
    };
  }

  if (runtime.lastBlockedAction) {
    return {
      tone: "warning",
      message: runtime.lastBlockedAction.message,
    };
  }

  if (runtime.status === "preparing") {
    return {
      tone: "info",
      message: withElasticCollisionNote(
        "Calculating the result. Playback and time jump unlock when it finishes.",
      ),
    };
  }

  if (runtime.playbackMode === "precomputed" && runtime.status === "running") {
    return {
      tone: "info",
      message: withElasticCollisionNote(
        "Showing the calculated result. Pause to inspect or jump to another time.",
      ),
    };
  }

  if (runtime.playbackMode === "precomputed" && runtime.status === "preparing") {
    return {
      tone: "info",
      message: withElasticCollisionNote(
        "Calculating the result. Playback and time jump unlock when it finishes.",
      ),
    };
  }

  if (runtime.playbackMode === "precomputed" && runtime.canSeek && runtime.status === "paused") {
    return {
      tone: "info",
      message: withElasticCollisionNote("Calculated result ready. Press Play result or jump to a time."),
    };
  }

  if (runtime.playbackMode === "precomputed" && !runtime.canSeek) {
    return {
      tone: "info",
      message: withElasticCollisionNote("Calculate a result to enable play, seek, and time jump."),
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
