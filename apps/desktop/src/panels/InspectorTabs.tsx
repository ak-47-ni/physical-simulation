import type { CSSProperties, ReactNode } from "react";

import { useI18n, type MessageKey } from "../i18n";

export type InspectorTabId = "selection" | "display" | "scene-tree" | "scene-physics";

type InspectorTab = {
  content: ReactNode;
  id: InspectorTabId;
  labelKey: MessageKey;
};

type InspectorTabsProps = {
  activeTabId: InspectorTabId;
  onActiveTabChange: (tabId: InspectorTabId) => void;
  tabs: readonly InspectorTab[];
};

const tabShellStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const tabListStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  padding: "6px",
  borderRadius: "14px",
  background: "#eef3fb",
  border: "1px solid rgba(108, 128, 173, 0.16)",
};

const tabButtonStyle: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: "10px",
  background: "transparent",
  color: "#50627d",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  padding: "8px 10px",
};

const activeTabButtonStyle: CSSProperties = {
  ...tabButtonStyle,
  background: "#ffffff",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  boxShadow: "0 8px 18px rgba(25, 48, 89, 0.08)",
  color: "#17304f",
};

const tabPanelStyle: CSSProperties = {
  display: "block",
};

export function InspectorTabs(props: InspectorTabsProps) {
  const { locale, t } = useI18n();
  const { activeTabId, onActiveTabChange, tabs } = props;

  return (
    <div data-testid="inspector-tabs" style={tabShellStyle}>
      <div aria-label="Inspector sections" role="tablist" style={tabListStyle}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = t(tab.labelKey).toLocaleUpperCase(locale);

          return (
            <button
              key={tab.id}
              aria-controls={`inspector-panel-${tab.id}`}
              aria-selected={isActive}
              data-testid={`inspector-tab-${tab.id}`}
              id={`inspector-tab-${tab.id}`}
              role="tab"
              style={isActive ? activeTabButtonStyle : tabButtonStyle}
              type="button"
              onClick={() => onActiveTabChange(tab.id)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <section
            key={tab.id}
            aria-labelledby={`inspector-tab-${tab.id}`}
            data-testid={`inspector-panel-${tab.id}`}
            hidden={!isActive}
            id={`inspector-panel-${tab.id}`}
            role="tabpanel"
            style={{
              ...tabPanelStyle,
              display: isActive ? "block" : "none",
            }}
          >
            {tab.content}
          </section>
        );
      })}
    </div>
  );
}
