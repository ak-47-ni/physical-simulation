import type { CSSProperties } from "react";

import type {
  RuntimeBridgeBlockReason,
  RuntimeBridgeBlockedAction,
  RuntimeBridgeStatus,
  RuntimePlaybackMode,
} from "../state/runtimeBridge";
import { useI18n } from "../i18n";
import { localizeSystemCopy } from "../localizeSystemCopy";

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

function withElasticCollisionNote(message: string, elasticCollisionNote: string) {
  return `${message} ${elasticCollisionNote}`;
}

function readBannerMessage(
  runtime: RuntimeStatusBannerProps["runtime"],
  t: ReturnType<typeof useI18n>["t"],
): {
  tone: "error" | "warning" | "info";
  message: string;
} | null {
  const elasticCollisionNote = t("transport.banner.elasticCollisionNote");

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
        t("transport.state.resultsOutOfDate"),
        elasticCollisionNote,
      ),
    };
  }

  if (runtime.lastBlockedAction) {
    return {
      tone: "warning",
      message: localizeSystemCopy(runtime.lastBlockedAction.message, t) ?? runtime.lastBlockedAction.message,
    };
  }

  if (runtime.status === "preparing") {
    return {
      tone: "info",
      message: withElasticCollisionNote(
        t("transport.state.calculatingUnlock"),
        elasticCollisionNote,
      ),
    };
  }

  if (runtime.playbackMode === "precomputed" && runtime.status === "running") {
    return {
      tone: "info",
      message: withElasticCollisionNote(
        t("transport.state.showingCalculatedResult"),
        elasticCollisionNote,
      ),
    };
  }

  if (runtime.playbackMode === "precomputed" && runtime.canSeek && runtime.status === "paused") {
    return {
      tone: "info",
      message: withElasticCollisionNote(t("transport.state.resultReady"), elasticCollisionNote),
    };
  }

  if (runtime.playbackMode === "precomputed" && !runtime.canSeek) {
    return {
      tone: "info",
      message: withElasticCollisionNote(t("transport.state.calculateToEnable"), elasticCollisionNote),
    };
  }

  if (runtime.status === "running") {
    return {
      tone: "info",
      message: t("transport.banner.runtimePlaying"),
    };
  }

  if (runtime.status === "paused") {
    return {
      tone: "info",
      message: t("transport.banner.runtimePaused"),
    };
  }

  return null;
}

export function RuntimeStatusBanner(props: RuntimeStatusBannerProps) {
  const { t } = useI18n();
  const feedback = readBannerMessage(props.runtime, t);

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
