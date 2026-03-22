import { useEffect, useState, type CSSProperties, type MouseEvent, type PropsWithChildren, type ReactNode } from "react";

import { usePaneLayout, type PaneKey } from "./usePaneLayout";

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
  minHeight: "84px",
};

const resizeHandleStyle: CSSProperties = {
  position: "relative",
  borderRadius: "999px",
  background: "rgba(139, 157, 190, 0.22)",
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
  size: number;
  onToggle: () => void;
  toggleLabel: string;
  testId: string;
  children?: ReactNode;
}) {
  const { title, collapsed, size, onToggle, toggleLabel, testId, children } = props;

  return (
    <section
      data-collapsed={collapsed}
      data-size={String(size)}
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

type ResizeSession = {
  axis: "x" | "y";
  direction: 1 | -1;
  pane: PaneKey;
  startClient: number;
  startSize: number;
};

export function ShellLayout(props: ShellLayoutProps) {
  const { children, leftPane, rightPane, bottomPane } = props;
  const { layout, resizePane, togglePane } = usePaneLayout();
  const [activeResize, setActiveResize] = useState<ResizeSession | null>(null);

  useEffect(() => {
    if (!activeResize) {
      return undefined;
    }

    function handleMouseMove(event: globalThis.MouseEvent) {
      const currentClient = activeResize.axis === "x" ? event.clientX : event.clientY;
      const delta = (currentClient - activeResize.startClient) * activeResize.direction;

      resizePane(activeResize.pane, activeResize.startSize + delta);
    }

    function handleMouseUp() {
      setActiveResize(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeResize, resizePane]);

  function beginResize(
    pane: PaneKey,
    axis: "x" | "y",
    direction: 1 | -1,
    event: MouseEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setActiveResize({
      axis,
      direction,
      pane,
      startClient: axis === "x" ? event.clientX : event.clientY,
      startSize: layout[pane].size,
    });
  }

  const shellStyle: CSSProperties = {
    display: "grid",
    gridTemplateRows: `72px minmax(0, 1fr) 10px ${
      layout.bottom.collapsed ? "auto" : `${layout.bottom.size}px`
    }`,
    gap: "14px",
    minHeight: "calc(100vh - 40px)",
  };

  const contentRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${layout.left.size}px 10px minmax(0, 1fr) 10px ${layout.right.size}px`,
    gap: "14px",
    minHeight: "0",
  };

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
            size={layout.left.size}
            testId="shell-left-pane"
            title="Library"
            toggleLabel={layout.left.collapsed ? "Show library" : "Hide library"}
          >
            {leftPane}
          </PaneCard>

          <div
            aria-label="Resize library pane"
            data-testid="shell-resize-left"
            style={{
              ...resizeHandleStyle,
              cursor: "col-resize",
            }}
            onMouseDown={(event) => beginResize("left", "x", 1, event)}
          />

          <section data-testid="shell-center-pane" style={centerPaneStyle}>
            {children}
          </section>

          <div
            aria-label="Resize inspector pane"
            data-testid="shell-resize-right"
            style={{
              ...resizeHandleStyle,
              cursor: "col-resize",
            }}
            onMouseDown={(event) => beginResize("right", "x", -1, event)}
          />

          <PaneCard
            collapsed={layout.right.collapsed}
            onToggle={() => togglePane("right")}
            size={layout.right.size}
            testId="shell-right-pane"
            title="Inspector"
            toggleLabel={layout.right.collapsed ? "Show inspector" : "Hide inspector"}
          >
            {rightPane}
          </PaneCard>
        </div>

        <div
          aria-label="Resize transport pane"
          data-testid="shell-resize-bottom"
          style={{
            ...resizeHandleStyle,
            cursor: "row-resize",
          }}
          onMouseDown={(event) => beginResize("bottom", "y", -1, event)}
        />

        <div style={bottomPaneStyle}>
          <PaneCard
            collapsed={layout.bottom.collapsed}
            onToggle={() => togglePane("bottom")}
            size={layout.bottom.size}
            testId="shell-bottom-pane"
            title="Transport"
            toggleLabel={layout.bottom.collapsed ? "Show transport" : "Hide transport"}
          >
            {bottomPane}
          </PaneCard>
        </div>
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
