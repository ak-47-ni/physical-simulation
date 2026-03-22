import { describe, expect, it } from "vitest";

import {
  buildRuntimeTrajectoryReadout,
  createAnalyzerSamplesFromTrajectory,
  type RuntimeTrajectorySample,
} from "./analysisTrajectorySamples";

const trajectorySamples: RuntimeTrajectorySample[] = [
  {
    frameNumber: 0,
    timeSeconds: 0,
    position: { x: 0, y: 3 },
    velocity: { x: 1.5, y: 0 },
    acceleration: { x: 0, y: -9.81 },
  },
  {
    frameNumber: 1,
    timeSeconds: 0.1,
    position: { x: 0.15, y: 2.95 },
    velocity: { x: 1.5, y: -0.981 },
    acceleration: { x: 0, y: -9.81 },
  },
];

describe("analysisTrajectorySamples", () => {
  it("creates analyzer displacement and velocity samples from runtime trajectory payloads", () => {
    expect(createAnalyzerSamplesFromTrajectory(trajectorySamples, "displacement")).toEqual([
      {
        id: "runtime-displacement-0",
        label: "t=0.00s",
        metric: "displacement",
        value: 3,
        unit: "m",
      },
      {
        id: "runtime-displacement-1",
        label: "t=0.10s",
        metric: "displacement",
        value: 2.9538,
        unit: "m",
      },
    ]);

    expect(createAnalyzerSamplesFromTrajectory(trajectorySamples, "velocity")).toEqual([
      {
        id: "runtime-velocity-0",
        label: "t=0.00s",
        metric: "velocity",
        value: 1.5,
        unit: "m/s",
      },
      {
        id: "runtime-velocity-1",
        label: "t=0.10s",
        metric: "velocity",
        value: 1.7923,
        unit: "m/s",
      },
    ]);
  });

  it("builds a latest runtime trajectory readout from the newest sample", () => {
    expect(buildRuntimeTrajectoryReadout(trajectorySamples)).toEqual({
      frameNumber: 1,
      timeSeconds: 0.1,
      position: { x: 0.15, y: 2.95 },
      velocity: { x: 1.5, y: -0.981 },
      acceleration: { x: 0, y: -9.81 },
    });
  });
});
