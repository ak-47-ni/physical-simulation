import type { CSSProperties } from "react";

import type { EditorSceneEntity, EditorState } from "../state/editorStore";
import type { EditorTool } from "./tools";

type WorkspaceCanvasProps = {
  entities: EditorSceneEntity[];
  state: EditorState;
  onToolChange: (tool: EditorTool) => void;
  onGridVisibleChange: (visible: boolean) => void;
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  padding: "14px 16px",
  borderBottom: "1px solid rgba(108, 128, 173, 0.14)",
  background: "rgba(255,255,255,0.72)",
};

const actionButtonStyle: CSSProperties = {
  border: "1px solid rgba(104, 124, 165, 0.24)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#18314f",
  padding: "8px 12px",
  cursor: "pointer",
};

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  const { entities, state, onGridVisibleChange, onToolChange } = props;

  return (
    <section
      data-grid-visible={String(state.gridVisible)}
      data-testid="workspace-canvas"
      data-tool={state.activeTool}
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        minHeight: "100%",
      }}
    >
      <div style={toolbarStyle}>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={actionButtonStyle} type="button" onClick={() => onToolChange("select")}>
            Select tool
          </button>
          <button style={actionButtonStyle} type="button" onClick={() => onToolChange("pan")}>
            Pan tool
          </button>
          <button style={actionButtonStyle} type="button" onClick={() => onToolChange("place-body")}>
            Place body tool
          </button>
        </div>

        <button
          style={actionButtonStyle}
          type="button"
          onClick={() => onGridVisibleChange(!state.gridVisible)}
        >
          {state.gridVisible ? "Hide grid" : "Show grid"}
        </button>
      </div>

      <div
        style={{
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#f4f7fb",
          backgroundImage: state.gridVisible
            ? "linear-gradient(0deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(170, 185, 215, 0.16) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.6), rgba(240,244,252,0.92))"
            : "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(240,244,252,0.95))",
          backgroundRepeat: "repeat, repeat, no-repeat",
          backgroundSize: state.gridVisible ? "24px 24px, 24px 24px, auto" : "auto",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "20px",
            borderRadius: "18px",
            border: "1px dashed rgba(101, 124, 165, 0.35)",
          }}
        />

        {entities.map((entity) => (
          <div
            key={entity.id}
            data-testid={`scene-entity-${entity.id}`}
            style={{
              position: "absolute",
              left: `${entity.x}px`,
              top: `${entity.y}px`,
              padding: "6px 10px",
              borderRadius: "999px",
              background: "rgba(17, 37, 64, 0.88)",
              color: "#f7fbff",
              fontSize: "12px",
            }}
          >
            {entity.label}
          </div>
        ))}
      </div>
    </section>
  );
}
