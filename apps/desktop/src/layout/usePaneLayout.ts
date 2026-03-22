import { useCallback, useState } from "react";

export type PaneKey = "left" | "right" | "bottom";

export type PaneState = {
  collapsed: boolean;
  size: number;
};

export type PaneLayoutState = Record<PaneKey, PaneState>;

const DEFAULT_LAYOUT: PaneLayoutState = {
  left: { collapsed: false, size: 280 },
  right: { collapsed: false, size: 320 },
  bottom: { collapsed: false, size: 132 },
};

const PANE_LIMITS: Record<PaneKey, { min: number; max: number }> = {
  left: { min: 220, max: 420 },
  right: { min: 240, max: 440 },
  bottom: { min: 112, max: 260 },
};

function clampPaneSize(pane: PaneKey, size: number) {
  const limits = PANE_LIMITS[pane];

  return Math.min(limits.max, Math.max(limits.min, Math.round(size)));
}

export function usePaneLayout() {
  const [layout, setLayout] = useState<PaneLayoutState>(DEFAULT_LAYOUT);

  const togglePane = useCallback((pane: PaneKey) => {
    setLayout((current) => ({
      ...current,
      [pane]: {
        ...current[pane],
        collapsed: !current[pane].collapsed,
      },
    }));
  }, []);

  const resizePane = useCallback((pane: PaneKey, size: number) => {
    setLayout((current) => ({
      ...current,
      [pane]: {
        ...current[pane],
        size: clampPaneSize(pane, size),
      },
    }));
  }, []);

  return {
    layout,
    resizePane,
    togglePane,
  };
}
