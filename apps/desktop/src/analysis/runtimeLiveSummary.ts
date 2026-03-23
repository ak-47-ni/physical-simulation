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
  status: RuntimeBridgeStatus;
  trajectorySamples: RuntimeTrajectorySample[];
};

type MotionSnapshot = {
  accelerationMagnitude: number;
  frameNumber: number;
  speedMagnitude: number;
};

export function buildRuntimeLiveSummary(
  input: BuildRuntimeLiveSummaryInput,
): RuntimeLiveSummary {
  const liveMotion = readMotionSnapshot(input.currentFrame, input.trajectorySamples);

  if (!liveMotion) {
    return {
      hasLiveData: false,
      headline: "No live data yet.",
      frameLabel: "Frame: --",
      elapsedLabel: `Elapsed time: ${formatSeconds(input.currentTimeSeconds)}`,
      sampleLabel: `Live samples: ${input.trajectorySamples.length}`,
      speedLabel: "Current speed: --",
      accelerationLabel: "Current acceleration: --",
    };
  }

  return {
    hasLiveData: true,
    headline: buildHeadline(input.status, liveMotion.frameNumber, input.currentTimeSeconds),
    frameLabel: `Frame: ${liveMotion.frameNumber}`,
    elapsedLabel: `Elapsed time: ${formatSeconds(input.currentTimeSeconds)}`,
    sampleLabel: `Live samples: ${input.trajectorySamples.length}`,
    speedLabel: `Current speed: ${formatMagnitude(liveMotion.speedMagnitude)} m/s`,
    accelerationLabel:
      `Current acceleration: ${formatMagnitude(liveMotion.accelerationMagnitude)} m/s^2`,
  };
}

function buildHeadline(
  status: RuntimeBridgeStatus,
  frameNumber: number,
  currentTimeSeconds: number,
): string {
  const timeLabel = formatSeconds(currentTimeSeconds);

  if (status === "running") {
    return `Running frame ${frameNumber} at ${timeLabel}`;
  }

  if (status === "paused") {
    return `Paused on frame ${frameNumber} at ${timeLabel}`;
  }

  return `Latest frame ${frameNumber} at ${timeLabel}`;
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
