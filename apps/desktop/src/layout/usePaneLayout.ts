import { useMemo, useState } from "react";

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

export function usePaneLayout() {
  const [layout, setLayout] = useState<PaneLayoutState>(DEFAULT_LAYOUT);

  function togglePane(pane: PaneKey) {
    setLayout((current) => ({
      ...current,
      [pane]: {
        ...current[pane],
        collapsed: !current[pane].collapsed,
      },
    }));
  }

  const actions = useMemo(
    () => ({
      togglePane,
    }),
    [],
  );

  return {
    layout,
    ...actions,
  };
}
