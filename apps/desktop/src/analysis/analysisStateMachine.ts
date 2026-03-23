export const ANALYZER_METRICS = [
  "displacement",
  "velocity",
  "acceleration",
  "energy",
] as const;

export type AnalyzerMetric = (typeof ANALYZER_METRICS)[number];

export type AnalyzerOverlayState = {
  showTrajectories: boolean;
  showVelocityVectors: boolean;
  showForceVectors: boolean;
  chartPanelOpen: boolean;
};

export type AnalyzerSample = {
  id: string;
  label: string;
  metric: AnalyzerMetric;
  value: number;
  unit: string;
};

export type AnalyzerDraftState = {
  label: string;
  metric: AnalyzerMetric;
  value: string;
  unit: string;
};

export type AnalyzerState = {
  overlays: AnalyzerOverlayState;
  selectedMetric: AnalyzerMetric;
  samples: AnalyzerSample[];
  draft: AnalyzerDraftState;
};

export type AnalyzerSampleGroup = {
  metric: AnalyzerMetric;
  samples: AnalyzerSample[];
};

export function formatAnalyzerMetric(metric: AnalyzerMetric) {
  return `${metric.slice(0, 1).toUpperCase()}${metric.slice(1)}`;
}

export function groupAnalyzerSamples(samples: AnalyzerSample[]): AnalyzerSampleGroup[] {
  return ANALYZER_METRICS.map((metric) => ({
    metric,
    samples: samples.filter((sample) => sample.metric === metric),
  })).filter((group) => group.samples.length > 0);
}

export function createAnalyzerState(initialState?: Partial<AnalyzerState>): AnalyzerState {
  return {
    overlays: {
      showTrajectories: false,
      showVelocityVectors: false,
      showForceVectors: false,
      chartPanelOpen: false,
      ...initialState?.overlays,
    },
    selectedMetric: initialState?.selectedMetric ?? "displacement",
    samples: initialState?.samples ?? [],
    draft: {
      label: "",
      metric: "displacement",
      value: "",
      unit: "",
      ...initialState?.draft,
    },
  };
}

export function updateAnalyzerDraftState(
  state: AnalyzerState,
  nextDraft: Partial<AnalyzerDraftState>,
): AnalyzerState {
  return {
    ...state,
    draft: {
      ...state.draft,
      ...nextDraft,
    },
  };
}

export function toggleAnalyzerOverlayState(
  state: AnalyzerState,
  key: keyof AnalyzerOverlayState,
): AnalyzerState {
  return {
    ...state,
    overlays: {
      ...state.overlays,
      [key]: !state.overlays[key],
    },
  };
}

export function acceptAnalyzerDraftSample(state: AnalyzerState): AnalyzerState {
  const label = state.draft.label.trim();
  const value = Number.parseFloat(state.draft.value);

  if (!label || Number.isNaN(value)) {
    return state;
  }

  return {
    ...state,
    samples: [
      ...state.samples,
      {
        id: `${label}-${state.samples.length + 1}`,
        label,
        metric: state.draft.metric,
        value,
        unit: state.draft.unit.trim(),
      },
    ],
    draft: {
      label: "",
      metric: state.draft.metric,
      value: "",
      unit: state.draft.unit,
    },
  };
}

export function selectAnalyzerChartMetric(
  state: AnalyzerState,
  metric: AnalyzerMetric,
): AnalyzerState {
  return {
    ...state,
    selectedMetric: metric,
  };
}
