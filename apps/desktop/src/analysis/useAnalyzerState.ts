import { useState } from "react";

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

export function createInitialAnalyzerState(): AnalyzerState {
  return {
    overlays: {
      showTrajectories: false,
      showVelocityVectors: false,
      showForceVectors: false,
      chartPanelOpen: false,
    },
    selectedMetric: "displacement",
    samples: [],
    draft: {
      label: "",
      metric: "displacement",
      value: "",
      unit: "",
    },
  };
}

export function useAnalyzerState(initialState?: Partial<AnalyzerState>) {
  const baseState = createInitialAnalyzerState();
  const [state, setState] = useState<AnalyzerState>(() => ({
    ...baseState,
    ...initialState,
    overlays: {
      ...baseState.overlays,
      ...initialState?.overlays,
    },
    selectedMetric: initialState?.selectedMetric ?? baseState.selectedMetric,
    samples: initialState?.samples ?? [],
    draft: {
      ...baseState.draft,
      ...initialState?.draft,
    },
  }));

  function updateDraft(nextDraft: Partial<AnalyzerDraftState>) {
    setState((current) => ({
      ...current,
      draft: {
        ...current.draft,
        ...nextDraft,
      },
    }));
  }

  function toggleOverlay(key: keyof AnalyzerOverlayState) {
    setState((current) => ({
      ...current,
      overlays: {
        ...current.overlays,
        [key]: !current.overlays[key],
      },
    }));
  }

  function acceptSample() {
    setState((current) => {
      const label = current.draft.label.trim();
      const value = Number.parseFloat(current.draft.value);

      if (!label || Number.isNaN(value)) {
        return current;
      }

      return {
        ...current,
        samples: [
          ...current.samples,
          {
            id: `${label}-${current.samples.length + 1}`,
            label,
            metric: current.draft.metric,
            value,
            unit: current.draft.unit.trim(),
          },
        ],
        draft: {
          label: "",
          metric: current.draft.metric,
          value: "",
          unit: current.draft.unit,
        },
      };
    });
  }

  return {
    state,
    updateDraft,
    toggleChartPanel: () => {
      toggleOverlay("chartPanelOpen");
    },
    toggleForceVectors: () => {
      toggleOverlay("showForceVectors");
    },
    toggleTrajectories: () => {
      toggleOverlay("showTrajectories");
    },
    toggleVelocityVectors: () => {
      toggleOverlay("showVelocityVectors");
    },
    selectChartMetric: (metric: AnalyzerMetric) => {
      setState((current) => ({
        ...current,
        selectedMetric: metric,
      }));
    },
    acceptSample,
  };
}
