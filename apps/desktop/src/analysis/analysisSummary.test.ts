import { describe, expect, it } from "vitest";

import type { AnalyzerSample } from "./useAnalyzerState";
import { buildAnalyzerChartSeries, buildAnalyzerMetricSummaries } from "./analysisSummary";

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

describe("analysisSummary", () => {
  it("builds per-metric summaries with latest and range values", () => {
    expect(buildAnalyzerMetricSummaries(samples)).toEqual([
      {
        metric: "velocity",
        count: 2,
        latestLabel: "Probe V2",
        latestValue: 4.2,
        minValue: 3.8,
        maxValue: 4.2,
        unit: "m/s",
      },
      {
        metric: "energy",
        count: 1,
        latestLabel: "Probe E1",
        latestValue: 12.4,
        minValue: 12.4,
        maxValue: 12.4,
        unit: "J",
      },
    ]);
  });

  it("builds chart series points in sample order for the selected metric", () => {
    expect(buildAnalyzerChartSeries(samples, "velocity")).toEqual([
      {
        index: 1,
        label: "Probe V1",
        value: 3.8,
        unit: "m/s",
      },
      {
        index: 2,
        label: "Probe V2",
        value: 4.2,
        unit: "m/s",
      },
    ]);
  });
});
