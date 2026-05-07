import {
  useEffect,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { desktopAppName, desktopAppVersion } from "../app-meta";
import { isAppLocale, useI18n } from "../i18n";
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
  gap: "16px",
  padding: "10px 18px",
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
  alignContent: "start",
  alignSelf: "start",
  display: "grid",
  gridTemplateRows: "auto",
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

const COLLAPSED_PANE_SIZE: Record<PaneKey, number> = {
  left: 72,
  right: 72,
  bottom: 56,
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

const topBarBrandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px 12px",
  flexWrap: "wrap",
  minWidth: 0,
};

const productNameStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#142033",
  fontSize: "22px",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};

const versionBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  background: "rgba(17, 37, 64, 0.08)",
  color: "#1f3657",
  fontSize: "12px",
  fontWeight: 600,
};

const subtitleStyle: CSSProperties = {
  color: "#516276",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const actionGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: "#516276",
  fontSize: "14px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const languageFieldStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#314661",
  fontSize: "13px",
  fontWeight: 600,
};

const languageSelectStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#112540",
  padding: "8px 12px",
  fontSize: "13px",
  cursor: "pointer",
};

function PaneCard(props: {
  collapsedTitle: string;
  title: string;
  collapsed: boolean;
  collapsedSize: number;
  size: number;
  onToggle: () => void;
  toggleLabel: string;
  testId: string;
  children?: ReactNode;
}) {
  const { collapsedTitle, title, collapsed, collapsedSize, size, onToggle, toggleLabel, testId, children } =
    props;

  return (
    <section
      data-collapsed={collapsed}
      data-collapsed-size={String(collapsedSize)}
      data-size={String(size)}
      data-testid={testId}
      style={{
        ...panelStyle,
        opacity: collapsed ? 0.74 : 1,
      }}
    >
      <div style={panelHeaderStyle}>
        <strong
          style={{
            fontSize: collapsed ? "11px" : "14px",
            letterSpacing: collapsed ? "0.08em" : undefined,
            textTransform: collapsedTitle === collapsedTitle.toUpperCase() ? "uppercase" : undefined,
          }}
        >
          {collapsed ? collapsedTitle : title}
        </strong>
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
  const { locale, locales, setLocale, t } = useI18n();
  const { layout, resetLayout, resizePane, togglePane } = usePaneLayout();
  const [activeResize, setActiveResize] = useState<ResizeSession | null>(null);

  useEffect(() => {
    if (!activeResize) {
      return undefined;
    }

    const resizeSession = activeResize;

    function handleMouseMove(event: globalThis.MouseEvent) {
      const currentClient = resizeSession.axis === "x" ? event.clientX : event.clientY;
      const delta = (currentClient - resizeSession.startClient) * resizeSession.direction;

      resizePane(resizeSession.pane, resizeSession.startSize + delta);
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

  const leftPaneSize = layout.left.collapsed ? COLLAPSED_PANE_SIZE.left : layout.left.size;
  const rightPaneSize = layout.right.collapsed ? COLLAPSED_PANE_SIZE.right : layout.right.size;
  const bottomPaneSize = layout.bottom.collapsed ? COLLAPSED_PANE_SIZE.bottom : layout.bottom.size;

  const shellStyle: CSSProperties = {
    display: "grid",
    gridTemplateRows: `auto minmax(0, 1fr) 10px ${bottomPaneSize}px`,
    gap: "14px",
    minHeight: "calc(100vh - 40px)",
  };

  const contentRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${leftPaneSize}px 10px minmax(0, 1fr) 10px ${rightPaneSize}px`,
    gap: "14px",
    minHeight: "0",
  };

  function handleLocaleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!isAppLocale(event.target.value)) {
      return;
    }

    setLocale(event.target.value);
  }

  return (
    <div style={appFrameStyle}>
      <div style={shellStyle}>
        <header style={topBarStyle}>
          <div data-testid="shell-brand-row" style={topBarBrandRowStyle}>
            <span style={productNameStyle}>{desktopAppName.toUpperCase()}</span>
            <h1 style={titleStyle}>{t("shell.title")}</h1>
            <span data-testid="shell-version" style={versionBadgeStyle}>
              {t("shell.version", { version: desktopAppVersion })}
            </span>
            <span style={subtitleStyle}>{t("shell.subtitle")}</span>
          </div>
          <div style={actionGroupStyle}>
            <button data-testid="shell-reset-layout" style={buttonStyle} type="button" onClick={resetLayout}>
              {t("shell.resetLayout")}
            </button>
            <label style={languageFieldStyle}>
              <span>{t("shell.languageLabel")}</span>
              <select
                aria-label={t("shell.languageLabel")}
                data-testid="shell-language-select"
                style={languageSelectStyle}
                value={locale}
                onChange={handleLocaleChange}
              >
                {locales.map((nextLocale) => (
                  <option key={nextLocale} value={nextLocale}>
                    {t(`shell.language.${nextLocale}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div style={contentRowStyle}>
          <PaneCard
            collapsed={layout.left.collapsed}
            collapsedSize={COLLAPSED_PANE_SIZE.left}
            collapsedTitle={t("shell.pane.libraryShort")}
            onToggle={() => togglePane("left")}
            size={layout.left.size}
            testId="shell-left-pane"
            title={t("shell.pane.library")}
            toggleLabel={
              layout.left.collapsed ? t("shell.toggle.showLibrary") : t("shell.toggle.hideLibrary")
            }
          >
            {leftPane}
          </PaneCard>

          <div
            aria-label={t("shell.resize.library")}
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
            aria-label={t("shell.resize.inspector")}
            data-testid="shell-resize-right"
            style={{
              ...resizeHandleStyle,
              cursor: "col-resize",
            }}
            onMouseDown={(event) => beginResize("right", "x", -1, event)}
          />

          <PaneCard
            collapsed={layout.right.collapsed}
            collapsedSize={COLLAPSED_PANE_SIZE.right}
            collapsedTitle={t("shell.pane.inspectorShort")}
            onToggle={() => togglePane("right")}
            size={layout.right.size}
            testId="shell-right-pane"
            title={t("shell.pane.inspector")}
            toggleLabel={
              layout.right.collapsed
                ? t("shell.toggle.showInspector")
                : t("shell.toggle.hideInspector")
            }
          >
            {rightPane}
          </PaneCard>
        </div>

        <div
          aria-label={t("shell.resize.transport")}
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
            collapsedSize={COLLAPSED_PANE_SIZE.bottom}
            collapsedTitle={t("shell.pane.transportShort")}
            onToggle={() => togglePane("bottom")}
            size={layout.bottom.size}
            testId="shell-bottom-pane"
            title={t("shell.pane.transport")}
            toggleLabel={
              layout.bottom.collapsed
                ? t("shell.toggle.showTransport")
                : t("shell.toggle.hideTransport")
            }
          >
            {bottomPane}
          </PaneCard>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceMountPlaceholder() {
  const { t } = useI18n();

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
          {t("shell.workspaceMount")}
        </div>
      </div>
    </div>
  );
}
