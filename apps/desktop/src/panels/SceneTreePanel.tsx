import type { CSSProperties } from "react";

import type { EditorConstraint } from "../state/editorConstraints";
import type { EditorSceneEntity } from "../state/editorStore";

type SceneTreePanelProps = {
  constraints?: EditorConstraint[];
  entities: EditorSceneEntity[];
  onSelectConstraint?: (constraintId: string) => void;
  onSelectEntity: (entityId: string) => void;
  selectedConstraintId?: string | null;
  selectedEntityId: string | null;
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
  const {
    constraints = [],
    entities,
    onSelectConstraint = () => undefined,
    onSelectEntity,
    selectedConstraintId = null,
    selectedEntityId,
  } = props;

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
      <h3 style={{ ...itemButtonStyle, border: "none", background: "transparent", padding: 0 }}>
        Entities
      </h3>
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
          onClick={() => onSelectEntity(entity.id)}
        >
          {entity.label}
        </button>
      ))}
      {constraints.length > 0 ? (
        <>
          <h3 style={{ ...itemButtonStyle, border: "none", background: "transparent", padding: 0 }}>
            Constraints
          </h3>
          {constraints.map((constraint) => (
            <button
              key={constraint.id}
              data-selected={String(selectedConstraintId === constraint.id)}
              data-testid={`scene-tree-constraint-${constraint.id}`}
              style={{
                ...itemButtonStyle,
                background: selectedConstraintId === constraint.id ? "#eaf1ff" : "#ffffff",
              }}
              type="button"
              onClick={() => onSelectConstraint(constraint.id)}
            >
              {constraint.label}
            </button>
          ))}
        </>
      ) : null}
    </div>
  );
}
