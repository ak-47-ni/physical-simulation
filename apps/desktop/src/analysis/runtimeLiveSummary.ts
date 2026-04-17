import type {
  RuntimeBridgeStatus,
  RuntimeFrameEntityView,
  RuntimeFrameView,
  RuntimeTrajectorySample,
} from "../state/runtimeBridge";

export type RuntimeLiveSummary = {
  hasLiveData: boolean;
  headline: string;
  frameLabel: string;
  elapsedLabel: string;
  sampleLabel: string;
  speedLabel: string;
  accelerationLabel: string;
};

type BuildRuntimeLiveSummaryInput = {
  currentFrame: RuntimeFrameView | null;
  currentTimeSeconds: number;
  formatters?: Partial<RuntimeLiveSummaryFormatters>;
  status: RuntimeBridgeStatus;
  trajectorySamples: RuntimeTrajectorySample[];
};

type MotionSnapshot = {
  accelerationMagnitude: number;
  frameNumber: number;
  speedMagnitude: number;
};

type RuntimeLiveSummaryFormatters = {
  noLiveDataHeadline: () => string;
  frame: (frameNumber: number) => string;
  framePlaceholder: () => string;
  elapsedTime: (time: string) => string;
  liveSamples: (count: number) => string;
  currentSpeed: (value: string) => string;
  currentSpeedPlaceholder: () => string;
  currentAcceleration: (value: string) => string;
  currentAccelerationPlaceholder: () => string;
  runningHeadline: (frameNumber: number, time: string) => string;
  pausedHeadline: (frameNumber: number, time: string) => string;
  latestHeadline: (frameNumber: number, time: string) => string;
};

const defaultFormatters: RuntimeLiveSummaryFormatters = {
  noLiveDataHeadline: () => "No live data yet.",
  frame: (frameNumber) => `Frame: ${frameNumber}`,
  framePlaceholder: () => "Frame: --",
  elapsedTime: (time) => `Elapsed time: ${time}`,
  liveSamples: (count) => `Live samples: ${count}`,
  currentSpeed: (value) => `Current speed: ${value}`,
  currentSpeedPlaceholder: () => "Current speed: --",
  currentAcceleration: (value) => `Current acceleration: ${value}`,
  currentAccelerationPlaceholder: () => "Current acceleration: --",
  runningHeadline: (frameNumber, time) => `Running frame ${frameNumber} at ${time}`,
  pausedHeadline: (frameNumber, time) => `Paused on frame ${frameNumber} at ${time}`,
  latestHeadline: (frameNumber, time) => `Latest frame ${frameNumber} at ${time}`,
};

export function buildRuntimeLiveSummary(
  input: BuildRuntimeLiveSummaryInput,
): RuntimeLiveSummary {
  const formatters = { ...defaultFormatters, ...input.formatters };
  const liveMotion = readMotionSnapshot(input.currentFrame, input.trajectorySamples);

  if (!liveMotion) {
    return {
      hasLiveData: false,
      headline: formatters.noLiveDataHeadline(),
      frameLabel: formatters.framePlaceholder(),
      elapsedLabel: formatters.elapsedTime(formatSeconds(input.currentTimeSeconds)),
      sampleLabel: formatters.liveSamples(input.trajectorySamples.length),
      speedLabel: formatters.currentSpeedPlaceholder(),
      accelerationLabel: formatters.currentAccelerationPlaceholder(),
    };
  }

  return {
    hasLiveData: true,
    headline: buildHeadline(
      input.status,
      liveMotion.frameNumber,
      input.currentTimeSeconds,
      formatters,
    ),
    frameLabel: formatters.frame(liveMotion.frameNumber),
    elapsedLabel: formatters.elapsedTime(formatSeconds(input.currentTimeSeconds)),
    sampleLabel: formatters.liveSamples(input.trajectorySamples.length),
    speedLabel: formatters.currentSpeed(`${formatMagnitude(liveMotion.speedMagnitude)} m/s`),
    accelerationLabel: formatters.currentAcceleration(
      `${formatMagnitude(liveMotion.accelerationMagnitude)} m/s^2`,
    ),
  };
}

function buildHeadline(
  status: RuntimeBridgeStatus,
  frameNumber: number,
  currentTimeSeconds: number,
  formatters: RuntimeLiveSummaryFormatters,
): string {
  const timeLabel = formatSeconds(currentTimeSeconds);

  if (status === "running") {
    return formatters.runningHeadline(frameNumber, timeLabel);
  }

  if (status === "paused") {
    return formatters.pausedHeadline(frameNumber, timeLabel);
  }

  return formatters.latestHeadline(frameNumber, timeLabel);
}

function readMotionSnapshot(
  currentFrame: RuntimeFrameView | null,
  trajectorySamples: RuntimeTrajectorySample[],
): MotionSnapshot | null {
  const entity = currentFrame?.entities[0];

  if (entity) {
    return {
      accelerationMagnitude: readVectorMagnitude(entity.acceleration),
      frameNumber: currentFrame.frameNumber,
      speedMagnitude: readVectorMagnitude(entity.velocity),
    };
  }

  const sample = trajectorySamples.at(-1);

  if (!sample) {
    return null;
  }

  return {
    accelerationMagnitude: readVectorMagnitude(sample.acceleration),
    frameNumber: sample.frameNumber,
    speedMagnitude: readVectorMagnitude(sample.velocity),
  };
}

function readVectorMagnitude(
  vector: RuntimeFrameEntityView["velocity"] | RuntimeTrajectorySample["velocity"],
): number {
  if (!vector) {
    return 0;
  }

  return Math.hypot(vector.x, vector.y);
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

function formatMagnitude(value: number): string {
  return value.toFixed(2);
}
