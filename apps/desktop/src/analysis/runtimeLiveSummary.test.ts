import { describe, expect, it } from "vitest";

import type {
  RuntimeBridgeStatus,
  RuntimeFrameView,
  RuntimeTrajectorySample,
} from "../state/runtimeBridge";
import { buildRuntimeLiveSummary } from "./runtimeLiveSummary";

function createFrame(input: {
  frameNumber: number;
  velocity: { x: number; y: number };
  acceleration: { x: number; y: number };
}): RuntimeFrameView {
  return {
    frameNumber: input.frameNumber,
    entities: [
      {
        id: "ball-1",
        transform: {
          x: 24,
          y: 48,
          rotation: 0,
        },
        velocity: input.velocity,
        acceleration: input.acceleration,
      },
    ],
  };
}

function createSample(input: {
  frameNumber: number;
  timeSeconds: number;
  velocity: { x: number; y: number };
  acceleration: { x: number; y: number };
}): RuntimeTrajectorySample {
  return {
    frameNumber: input.frameNumber,
    timeSeconds: input.timeSeconds,
    position: { x: 24, y: 48 },
    velocity: input.velocity,
    acceleration: input.acceleration,
  };
}

function summarize(input: {
  currentFrame: RuntimeFrameView | null;
  currentTimeSeconds: number;
  status: RuntimeBridgeStatus;
  trajectorySamples: RuntimeTrajectorySample[];
}) {
  return buildRuntimeLiveSummary(input);
}

describe("runtimeLiveSummary", () => {
  it("builds teacher-readable speed and acceleration readouts from a live frame", () => {
    expect(
      summarize({
        currentFrame: createFrame({
          frameNumber: 12,
          velocity: { x: 3, y: 4 },
          acceleration: { x: 0, y: 9.81 },
        }),
        currentTimeSeconds: 0.4,
        status: "running",
        trajectorySamples: [
          createSample({
            frameNumber: 12,
            timeSeconds: 0.4,
            velocity: { x: 3, y: 4 },
            acceleration: { x: 0, y: 9.81 },
          }),
        ],
      }),
    ).toEqual({
      hasLiveData: true,
      headline: "Running frame 12 at 0.40 s",
      frameLabel: "Frame: 12",
      elapsedLabel: "Elapsed time: 0.40 s",
      sampleLabel: "Live samples: 1",
      speedLabel: "Current speed: 5.00 m/s",
      accelerationLabel: "Current acceleration: 9.81 m/s^2",
    });
  });

  it("returns a clear no-data summary before live runtime data exists", () => {
    expect(
      summarize({
        currentFrame: null,
        currentTimeSeconds: 0,
        status: "idle",
        trajectorySamples: [],
      }),
    ).toEqual({
      hasLiveData: false,
      headline: "No live data yet.",
      frameLabel: "Frame: --",
      elapsedLabel: "Elapsed time: 0.00 s",
      sampleLabel: "Live samples: 0",
      speedLabel: "Current speed: --",
      accelerationLabel: "Current acceleration: --",
    });
  });

  it("preserves the last readable frame values while paused", () => {
    expect(
      summarize({
        currentFrame: createFrame({
          frameNumber: 8,
          velocity: { x: 1.5, y: 2 },
          acceleration: { x: 0, y: 9.81 },
        }),
        currentTimeSeconds: 0.25,
        status: "paused",
        trajectorySamples: [
          createSample({
            frameNumber: 8,
            timeSeconds: 0.25,
            velocity: { x: 1.5, y: 2 },
            acceleration: { x: 0, y: 9.81 },
          }),
        ],
      }),
    ).toEqual({
      hasLiveData: true,
      headline: "Paused on frame 8 at 0.25 s",
      frameLabel: "Frame: 8",
      elapsedLabel: "Elapsed time: 0.25 s",
      sampleLabel: "Live samples: 1",
      speedLabel: "Current speed: 2.50 m/s",
      accelerationLabel: "Current acceleration: 9.81 m/s^2",
    });
  });

  it("reports running frame and elapsed time with the current sample count", () => {
    expect(
      summarize({
        currentFrame: createFrame({
          frameNumber: 19,
          velocity: { x: 0, y: 6 },
          acceleration: { x: 0, y: 9.81 },
        }),
        currentTimeSeconds: 1.2,
        status: "running",
        trajectorySamples: [
          createSample({
            frameNumber: 18,
            timeSeconds: 1.18,
            velocity: { x: 0, y: 5.5 },
            acceleration: { x: 0, y: 9.81 },
          }),
          createSample({
            frameNumber: 19,
            timeSeconds: 1.2,
            velocity: { x: 0, y: 6 },
            acceleration: { x: 0, y: 9.81 },
          }),
        ],
      }),
    ).toMatchObject({
      headline: "Running frame 19 at 1.20 s",
      frameLabel: "Frame: 19",
      elapsedLabel: "Elapsed time: 1.20 s",
      sampleLabel: "Live samples: 2",
    });
  });
});
