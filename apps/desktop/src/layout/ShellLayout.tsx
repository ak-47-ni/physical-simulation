import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

import { usePaneLayout } from "./usePaneLayout";

type ShellLayoutProps = PropsWithChildren<{
  leftPane?: ReactNode;
  rightPane?: ReactNode;
  bottomPane?: ReactNode;
}>;

const appFrameStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(98, 151, 255, 0.15), transparent 28%), #f3f6fb",
  color: "#142033",
  padding: "20px",
  boxSizing: "border-box",
  fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
};

const shellStyle: CSSProperties = {
  display: "grid",
  gridTemplateRows: "72px minmax(0, 1fr) auto",
  gap: "14px",
  minHeight: "calc(100vh - 40px)",
};

const topBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 22px",
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.84)",
  border: "1px solid rgba(108, 128, 173, 0.2)",
  boxShadow: "0 12px 30px rgba(25, 48, 89, 0.08)",
  backdropFilter: "blur(18px)",
};

const contentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr) minmax(0, 320px)",
  gap: "14px",
  minHeight: "0",
};

const panelStyle: CSSProperties = {
  borderRadius: "18px",
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  boxShadow: "0 12px 26px rgba(25, 48, 89, 0.07)",
  overflow: "hidden",
  minHeight: 0,
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: "1px solid rgba(108, 128, 173, 0.14)",
};

const centerPaneStyle: CSSProperties = {
  ...panelStyle,
  display: "grid",
  gridTemplateRows: "1fr",
  minHeight: "520px",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.9), rgba(245,248,253,0.96))",
};

const workspacePlaceholderStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  minHeight: "100%",
  background:
    "linear-gradient(0deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.6), rgba(240,244,252,0.92))",
  backgroundSize: "24px 24px, 24px 24px, auto",
};

const bottomPaneStyle: CSSProperties = {
  ...panelStyle,
  minHeight: "84px",
};

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: "999px",
  background: "#112540",
  color: "#f6f8fb",
  padding: "8px 12px",
  fontSize: "12px",
  cursor: "pointer",
};

function PaneCard(props: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleLabel: string;
  testId: string;
  children?: ReactNode;
}) {
  const { title, collapsed, onToggle, toggleLabel, testId, children } = props;

  return (
    <section
      data-collapsed={collapsed}
      data-testid={testId}
      style={{
        ...panelStyle,
        opacity: collapsed ? 0.74 : 1,
      }}
    >
      <div style={panelHeaderStyle}>
        <strong>{title}</strong>
        <button style={buttonStyle} type="button" onClick={onToggle}>
          {toggleLabel}
        </button>
      </div>
      <div
        style={{
          display: collapsed ? "none" : "block",
          padding: "16px",
          color: "#50627d",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function ShellLayout(props: ShellLayoutProps) {
  const { children, leftPane, rightPane, bottomPane } = props;
  const { layout, togglePane } = usePaneLayout();

  return (
    <div style={appFrameStyle}>
      <div style={shellStyle}>
        <header style={topBarStyle}>
          <div>
            <div style={{ fontSize: "13px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
              Physics Sandbox
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: "24px" }}>Desktop Editor Shell</h1>
          </div>
          <div style={{ display: "flex", gap: "10px", color: "#516276", fontSize: "14px" }}>
            <span>Canvas-first</span>
            <span>Resizable panes</span>
            <span>Worker C mount-ready</span>
          </div>
        </header>

        <div style={contentRowStyle}>
          <PaneCard
            collapsed={layout.left.collapsed}
            onToggle={() => togglePane("left")}
            testId="shell-left-pane"
            title="Library"
            toggleLabel={layout.left.collapsed ? "Show library" : "Hide library"}
          >
            {leftPane}
          </PaneCard>

          <section data-testid="shell-center-pane" style={centerPaneStyle}>
            {children}
          </section>

          <PaneCard
            collapsed={layout.right.collapsed}
            onToggle={() => togglePane("right")}
            testId="shell-right-pane"
            title="Inspector"
            toggleLabel={layout.right.collapsed ? "Show inspector" : "Hide inspector"}
          >
            {rightPane}
          </PaneCard>
        </div>

        <PaneCard
          collapsed={layout.bottom.collapsed}
          onToggle={() => togglePane("bottom")}
          testId="shell-bottom-pane"
          title="Transport"
          toggleLabel={layout.bottom.collapsed ? "Show transport" : "Hide transport"}
        >
          {bottomPane}
        </PaneCard>
      </div>
    </div>
  );
}

export function WorkspaceMountPlaceholder() {
  return (
    <div style={workspacePlaceholderStyle}>
      <div
        style={{
          position: "absolute",
          inset: "24px",
          borderRadius: "18px",
          border: "1px dashed rgba(101, 124, 165, 0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            padding: "8px 12px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.82)",
            color: "#54657f",
            fontSize: "12px",
          }}
        >
          Workspace mount point
        </div>
      </div>
    </div>
  );
}
