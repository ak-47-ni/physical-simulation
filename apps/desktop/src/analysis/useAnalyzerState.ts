import { useState } from "react";

export type AnalyzerOverlayState = {
  showTrajectories: boolean;
  showVelocityVectors: boolean;
  showForceVectors: boolean;
  chartPanelOpen: boolean;
};

export type AnalyzerSample = {
  id: string;
  label: string;
  value: number;
  unit: string;
};

export type AnalyzerDraftState = {
  label: string;
  value: string;
  unit: string;
};

export type AnalyzerState = {
  overlays: AnalyzerOverlayState;
  samples: AnalyzerSample[];
  draft: AnalyzerDraftState;
};

export function createInitialAnalyzerState(): AnalyzerState {
  return {
    overlays: {
      showTrajectories: false,
      showVelocityVectors: false,
      showForceVectors: false,
      chartPanelOpen: false,
    },
    samples: [],
    draft: {
      label: "",
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
            value,
            unit: current.draft.unit.trim(),
          },
        ],
        draft: {
          label: "",
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
    acceptSample,
  };
}
