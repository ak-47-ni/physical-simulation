import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { AnalyzerMetric, AnalyzerSample } from "./analysisStateMachine";
import type { RuntimeTrajectorySample } from "../state/runtimeBridge";

export type { RuntimeTrajectorySample };

type SupportedRuntimeMetric = Exclude<AnalyzerMetric, "energy">;

const UNIT_BY_METRIC: Record<SupportedRuntimeMetric, string> = {
  displacement: "m",
  velocity: "m/s",
  acceleration: "m/s^2",
};

const VECTOR_FIELD_BY_METRIC: Record<
  SupportedRuntimeMetric,
  "position" | "velocity" | "acceleration"
> = {
  displacement: "position",
  velocity: "velocity",
  acceleration: "acceleration",
};

export function buildRuntimeTrajectoryReadout(
  samples: RuntimeTrajectorySample[],
): RuntimeTrajectorySample | null {
  return samples.at(-1) ?? null;
}

export function createAnalyzerSamplesFromTrajectory(
  samples: RuntimeTrajectorySample[],
  metric: AnalyzerMetric,
): AnalyzerSample[] {
  if (metric === "energy") {
    return [];
  }

  return samples.map((sample) => ({
    id: `runtime-${metric}-${sample.frameNumber}`,
    label: `t=${sample.timeSeconds.toFixed(2)}s`,
    metric,
    value: Number(
      Math.hypot(
        sample[VECTOR_FIELD_BY_METRIC[metric]].x,
        sample[VECTOR_FIELD_BY_METRIC[metric]].y,
      ).toFixed(4),
    ),
    unit: UNIT_BY_METRIC[metric],
  }));
}
