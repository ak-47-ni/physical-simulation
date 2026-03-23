import { useState } from "react";

import {
  acceptAnalyzerDraftSample,
  createAnalyzerState,
  selectAnalyzerChartMetric,
  toggleAnalyzerOverlayState,
  updateAnalyzerDraftState,
} from "./analysisStateMachine";
import type {
  AnalyzerDraftState,
  AnalyzerMetric,
  AnalyzerOverlayState,
  AnalyzerState,
} from "./analysisStateMachine";

export {
  ANALYZER_METRICS,
  createAnalyzerState as createInitialAnalyzerState,
  formatAnalyzerMetric,
  groupAnalyzerSamples,
} from "./analysisStateMachine";
export type {
  AnalyzerDraftState,
  AnalyzerMetric,
  AnalyzerOverlayState,
  AnalyzerSample,
  AnalyzerSampleGroup,
  AnalyzerState,
} from "./analysisStateMachine";

type UseAnalyzerStateOptions = {
  initialState?: Partial<AnalyzerState>;
  state?: AnalyzerState;
  onStateChange?: (nextState: AnalyzerState) => void;
};

export function useAnalyzerState(options: UseAnalyzerStateOptions = {}) {
  const [internalState, setInternalState] = useState<AnalyzerState>(() =>
    createAnalyzerState(options.initialState),
  );
  const state = options.state ?? internalState;

  function applyStateChange(updater: (currentState: AnalyzerState) => AnalyzerState) {
    const nextState = updater(state);

    if (options.onStateChange) {
      options.onStateChange(nextState);
      return;
    }

    setInternalState(nextState);
  }

  function updateDraft(nextDraft: Partial<AnalyzerDraftState>) {
    applyStateChange((currentState) => updateAnalyzerDraftState(currentState, nextDraft));
  }

  return {
    state,
    updateDraft,
    toggleChartPanel: () => {
      applyStateChange((currentState) =>
        toggleAnalyzerOverlayState(currentState, "chartPanelOpen"),
      );
    },
    toggleForceVectors: () => {
      applyStateChange((currentState) =>
        toggleAnalyzerOverlayState(currentState, "showForceVectors"),
      );
    },
    toggleTrajectories: () => {
      applyStateChange((currentState) =>
        toggleAnalyzerOverlayState(currentState, "showTrajectories"),
      );
    },
    toggleVelocityVectors: () => {
      applyStateChange((currentState) =>
        toggleAnalyzerOverlayState(currentState, "showVelocityVectors"),
      );
    },
    selectChartMetric: (metric: AnalyzerMetric) => {
      applyStateChange((currentState) => selectAnalyzerChartMetric(currentState, metric));
    },
    acceptSample: () => {
      applyStateChange((currentState) => acceptAnalyzerDraftSample(currentState));
    },
  };
}
