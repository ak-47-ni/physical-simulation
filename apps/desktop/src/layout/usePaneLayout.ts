import { useCallback, useEffect, useState } from "react";

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
const PANE_LAYOUT_STORAGE_KEY = "physics-sandbox:pane-layout";

const PANE_LIMITS: Record<PaneKey, { min: number; max: number }> = {
  left: { min: 220, max: 420 },
  right: { min: 240, max: 440 },
  bottom: { min: 112, max: 260 },
};

function createDefaultLayout(): PaneLayoutState {
  return {
    left: { ...DEFAULT_LAYOUT.left },
    right: { ...DEFAULT_LAYOUT.right },
    bottom: { ...DEFAULT_LAYOUT.bottom },
  };
}

function clampPaneSize(pane: PaneKey, size: number) {
  const limits = PANE_LIMITS[pane];

  return Math.min(limits.max, Math.max(limits.min, Math.round(size)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizePaneState(pane: PaneKey, value: unknown): PaneState {
  if (!isRecord(value)) {
    return DEFAULT_LAYOUT[pane];
  }

  return {
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : DEFAULT_LAYOUT[pane].collapsed,
    size:
      typeof value.size === "number"
        ? clampPaneSize(pane, value.size)
        : DEFAULT_LAYOUT[pane].size,
  };
}

function loadStoredLayout(): PaneLayoutState {
  if (typeof window === "undefined") {
    return createDefaultLayout();
  }

  const rawLayout = window.localStorage.getItem(PANE_LAYOUT_STORAGE_KEY);

  if (!rawLayout) {
    return createDefaultLayout();
  }

  try {
    const parsed = JSON.parse(rawLayout);

    return {
      left: sanitizePaneState("left", parsed.left),
      right: sanitizePaneState("right", parsed.right),
      bottom: sanitizePaneState("bottom", parsed.bottom),
    };
  } catch {
    return createDefaultLayout();
  }
}

export function usePaneLayout() {
  const [layout, setLayout] = useState<PaneLayoutState>(loadStoredLayout);

  useEffect(() => {
    window.localStorage.setItem(PANE_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

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

  const resetLayout = useCallback(() => {
    setLayout(createDefaultLayout());
  }, []);

  return {
    layout,
    resizePane,
    resetLayout,
    togglePane,
  };
}
