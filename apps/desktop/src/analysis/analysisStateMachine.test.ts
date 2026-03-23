import { describe, expect, it } from "vitest";

import {
  acceptAnalyzerDraftSample,
  createAnalyzerState,
  selectAnalyzerChartMetric,
  toggleAnalyzerOverlayState,
  updateAnalyzerDraftState,
} from "./analysisStateMachine";

describe("analysisStateMachine", () => {
  it("merges initial state and accepts draft samples immutably", () => {
    const initial = createAnalyzerState({
      draft: {
        label: "Probe A",
        metric: "acceleration",
        value: "9.81",
        unit: "m/s^2",
      },
    });

    const accepted = acceptAnalyzerDraftSample(initial);

    expect(initial.samples).toEqual([]);
    expect(accepted.samples).toEqual([
      {
        id: "Probe A-1",
        label: "Probe A",
        metric: "acceleration",
        value: 9.81,
        unit: "m/s^2",
      },
    ]);
    expect(accepted.draft).toEqual({
      label: "",
      metric: "acceleration",
      value: "",
      unit: "m/s^2",
    });
  });

  it("updates draft fields, toggles overlays, and selects the chart metric", () => {
    const initial = createAnalyzerState();
    const withDraft = updateAnalyzerDraftState(initial, {
      label: "Probe V",
      metric: "velocity",
    });
    const withOverlay = toggleAnalyzerOverlayState(withDraft, "chartPanelOpen");
    const selectedMetric = selectAnalyzerChartMetric(withOverlay, "velocity");

    expect(withDraft.draft.label).toBe("Probe V");
    expect(withDraft.draft.metric).toBe("velocity");
    expect(withOverlay.overlays.chartPanelOpen).toBe(true);
    expect(selectedMetric.selectedMetric).toBe("velocity");
  });
});
