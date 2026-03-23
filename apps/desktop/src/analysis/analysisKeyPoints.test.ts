import { describe, expect, it } from "vitest";

import type { AnalyzerSample } from "./useAnalyzerState";
import { buildAnalyzerKeyPointRows } from "./analysisKeyPoints";

const samples: AnalyzerSample[] = [
  {
    id: "velocity-1",
    label: "Probe V1",
    metric: "velocity",
    value: 3.8,
    unit: "m/s",
  },
  {
    id: "velocity-2",
    label: "Probe V2",
    metric: "velocity",
    value: 4.2,
    unit: "m/s",
  },
  {
    id: "energy-1",
    label: "Probe E1",
    metric: "energy",
    value: 12.4,
    unit: "J",
  },
];

describe("analysisKeyPoints", () => {
  it("builds key-point rows for the selected metric with previous-sample deltas", () => {
    expect(buildAnalyzerKeyPointRows(samples, "velocity")).toEqual([
      {
        index: 1,
        label: "Probe V1",
        value: 3.8,
        unit: "m/s",
        deltaFromPrevious: null,
      },
      {
        index: 2,
        label: "Probe V2",
        value: 4.2,
        unit: "m/s",
        deltaFromPrevious: 0.4,
      },
    ]);
  });
});
