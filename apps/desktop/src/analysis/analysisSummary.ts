import {
  ANALYZER_METRICS,
  type AnalyzerMetric,
  type AnalyzerSample,
} from "./useAnalyzerState";

export type AnalyzerMetricSummary = {
  metric: AnalyzerMetric;
  count: number;
  latestLabel: string;
  latestValue: number;
  minValue: number;
  maxValue: number;
  unit: string;
};

export type AnalyzerChartPoint = {
  index: number;
  label: string;
  value: number;
  unit: string;
};

export function buildAnalyzerMetricSummaries(
  samples: AnalyzerSample[],
): AnalyzerMetricSummary[] {
  return ANALYZER_METRICS.flatMap((metric) => {
    const metricSamples = samples.filter((sample) => sample.metric === metric);

    if (metricSamples.length === 0) {
      return [];
    }

    const latestSample = metricSamples.at(-1);

    if (!latestSample) {
      return [];
    }

    const values = metricSamples.map((sample) => sample.value);

    return [
      {
        metric,
        count: metricSamples.length,
        latestLabel: latestSample.label,
        latestValue: latestSample.value,
        minValue: Math.min(...values),
        maxValue: Math.max(...values),
        unit: latestSample.unit,
      },
    ];
  });
}

export function buildAnalyzerChartSeries(
  samples: AnalyzerSample[],
  metric: AnalyzerMetric,
): AnalyzerChartPoint[] {
  return samples
    .filter((sample) => sample.metric === metric)
    .map((sample, index) => ({
      index: index + 1,
      label: sample.label,
      value: sample.value,
      unit: sample.unit,
    }));
}
