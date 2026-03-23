import type { CSSProperties } from "react";

import { BottomTransportBar, type BottomTransportRuntimeView } from "./BottomTransportBar";

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

  const compactRuntime: BottomTransportRuntimeView = {
    ...runtime,
    canSeek: seekEnabled,
    currentTimeSeconds,
    playbackMode: mode,
    preparingProgress: isPreparing ? preparationProgress : runtime.preparingProgress,
    status: isPreparing ? "preparing" : runtime.status,
    totalDurationSeconds: timelineMaxSeconds,
  };

  return (
    <section data-testid="playback-transport-deck" style={deckStyle}>
      <BottomTransportBar
        layout="compact"
        playbackSettings={{
          mode,
          precomputeDurationSeconds,
          realtimeDurationCapSeconds: realtimeCapSeconds,
        }}
        runtime={compactRuntime}
        onPause={onPause}
        onPlaybackModeChange={(nextMode) => onModeChange(nextMode as PlaybackMode)}
        onPrecomputeDurationChange={onPrecomputeDurationChange}
        onReset={onReset}
        onSeek={onSeek}
        onStart={onStart}
        onStep={onStep}
        onTimeScaleChange={onTimeScaleChange}
      />
    </section>
  );
}
