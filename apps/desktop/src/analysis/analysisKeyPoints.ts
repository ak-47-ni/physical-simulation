import type { AnalyzerMetric, AnalyzerSample } from "./useAnalyzerState";

export type AnalyzerKeyPointRow = {
  index: number;
  label: string;
  value: number;
  unit: string;
  deltaFromPrevious: number | null;
};

export function buildAnalyzerKeyPointRows(
  samples: AnalyzerSample[],
  metric: AnalyzerMetric,
): AnalyzerKeyPointRow[] {
  const metricSamples = samples.filter((sample) => sample.metric === metric);

  return metricSamples.map((sample, index) => {
    const previousSample = metricSamples[index - 1];
    const deltaFromPrevious = previousSample
      ? Number((sample.value - previousSample.value).toFixed(4))
      : null;

    return {
      index: index + 1,
      label: sample.label,
      value: sample.value,
      unit: sample.unit,
      deltaFromPrevious,
    };
  });
}
