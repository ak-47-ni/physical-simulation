import type { CSSProperties } from "react";

import type { SceneDisplaySettings } from "../io/sceneFile";
import type { EditorSceneEntity } from "../state/editorStore";

type PropertyPanelProps = {
  display: SceneDisplaySettings;
  onDeleteSelectedEntity: () => void;
  onDuplicateSelectedEntity: () => void;
  onUpdateSelectedEntityLabel: (label: string) => void;
  onUpdateSelectedEntityPosition: (position: { x: number; y: number }) => void;
  onUpdateSelectedEntityRadius: (radius: number) => void;
  onUpdateSelectedEntitySize: (size: { width: number; height: number }) => void;
  selectedEntity: EditorSceneEntity | null;
};

const sectionLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  borderRadius: "14px",
  background: "#f7f9fd",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#17304f",
  padding: "8px 10px",
  fontSize: "14px",
};

const textInputStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(196, 77, 77, 0.22)",
  borderRadius: "10px",
  background: "#fff3f2",
  color: "#9f2e2e",
  padding: "9px 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const actionButtonStyle: CSSProperties = {
  border: "1px solid rgba(108, 128, 173, 0.22)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#17304f",
  padding: "9px 12px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

function ReadonlyField(props: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <strong style={{ color: "#17304f", fontSize: "14px" }}>{props.value}</strong>
    </div>
  );
}

function PositionInput(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <input
        aria-label={props.label}
        style={inputStyle}
        type="number"
        value={props.value}
        onChange={(event) => {
          const nextValue = Number(event.target.value);

          if (!Number.isFinite(nextValue)) {
            return;
          }

          props.onChange(nextValue);
        }}
      />
    </label>
  );
}

function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <input
        aria-label={props.label}
        style={textInputStyle}
        type="text"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </label>
  );
}

export function PropertyPanel(props: PropertyPanelProps) {
  const {
    display,
    onDeleteSelectedEntity,
    onDuplicateSelectedEntity,
    onUpdateSelectedEntityLabel,
    onUpdateSelectedEntityPosition,
    onUpdateSelectedEntityRadius,
    onUpdateSelectedEntitySize,
    selectedEntity,
  } = props;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <section style={cardStyle}>
        <h2 style={sectionLabelStyle}>Selection</h2>
        {selectedEntity ? (
          <>
            <TextInput
              label="Entity name"
              value={selectedEntity.label}
              onChange={onUpdateSelectedEntityLabel}
            />
            <ReadonlyField label="Position" value={`${selectedEntity.x}, ${selectedEntity.y}`} />
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <PositionInput
                label="Position X"
                value={selectedEntity.x}
                onChange={(x) => onUpdateSelectedEntityPosition({ x, y: selectedEntity.y })}
              />
              <PositionInput
                label="Position Y"
                value={selectedEntity.y}
                onChange={(y) => onUpdateSelectedEntityPosition({ x: selectedEntity.x, y })}
              />
            </div>
            {selectedEntity.kind === "ball" ? (
              <PositionInput
                label="Radius"
                value={selectedEntity.radius}
                onChange={onUpdateSelectedEntityRadius}
              />
            ) : (
              <div
                style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
              >
                <PositionInput
                  label="Width"
                  value={selectedEntity.width}
                  onChange={(width) =>
                    onUpdateSelectedEntitySize({ width, height: selectedEntity.height })
                  }
                />
                <PositionInput
                  label="Height"
                  value={selectedEntity.height}
                  onChange={(height) =>
                    onUpdateSelectedEntitySize({ width: selectedEntity.width, height })
                  }
                />
              </div>
            )}
            <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <button style={actionButtonStyle} type="button" onClick={onDuplicateSelectedEntity}>
                Duplicate entity
              </button>
              <button style={dangerButtonStyle} type="button" onClick={onDeleteSelectedEntity}>
                Delete entity
              </button>
            </div>
          </>
        ) : (
          <span style={{ color: "#55657f", fontSize: "14px" }}>No entity selected</span>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={sectionLabelStyle}>Display</h2>
        <ReadonlyField label="Grid" value={display.gridVisible ? "Visible" : "Hidden"} />
        <ReadonlyField label="Labels" value={display.showLabels ? "On" : "Off"} />
        <ReadonlyField
          label="Trajectories"
          value={display.showTrajectories ? "On" : "Off"}
        />
      </section>
    </div>
  );
}
