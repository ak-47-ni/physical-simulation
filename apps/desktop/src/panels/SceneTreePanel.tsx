import type { CSSProperties } from "react";

import type { EditorSceneEntity } from "../state/editorStore";

type SceneTreePanelProps = {
  entities: EditorSceneEntity[];
  selectedEntityId: string | null;
  onSelect: (entityId: string) => void;
};

const itemButtonStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(108, 128, 173, 0.14)",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#17304f",
  textAlign: "left",
  padding: "10px 12px",
  cursor: "pointer",
};

export function SceneTreePanel(props: SceneTreePanelProps) {
  const { entities, onSelect, selectedEntityId } = props;

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <h2
        style={{
          margin: 0,
          fontSize: "12px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#64748b",
        }}
      >
        Scene Tree
      </h2>
      {entities.map((entity) => (
        <button
          key={entity.id}
          data-selected={String(selectedEntityId === entity.id)}
          data-testid={`scene-tree-item-${entity.id}`}
          style={{
            ...itemButtonStyle,
            background: selectedEntityId === entity.id ? "#eaf1ff" : "#ffffff",
          }}
          type="button"
          onClick={() => onSelect(entity.id)}
        >
          {entity.label}
        </button>
      ))}
    </div>
  );
}
