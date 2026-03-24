import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import type { LibraryConstraintKind } from "../state/editorConstraints";
import type { LibraryBodyKind, LibraryItemKind } from "../state/editorStore";
import type { LibraryDragSession } from "../workspace/libraryDragSession";

type ObjectLibraryPanelProps = {
  onSelectItem: (itemId: LibraryItemKind) => void;
  onStartBodyDrag?: (session: LibraryDragSession) => void;
  selectedItemId: LibraryItemKind;
};

type BodyLibraryItem = {
  id: LibraryBodyKind;
  label: string;
};

type ConstraintLibraryItem = {
  id: LibraryConstraintKind;
  label: string;
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const groupStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "8px 10px",
  background: "#f2f5fb",
  color: "#18314f",
  fontSize: "13px",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

const buttonChipStyle: CSSProperties = {
  ...chipStyle,
  cursor: "pointer",
};

const bodyChipStyle: CSSProperties = {
  ...buttonChipStyle,
  cursor: "grab",
};

const bodyItems: BodyLibraryItem[] = [
  { id: "ball", label: "Ball" },
  { id: "block", label: "Block" },
  { id: "board", label: "Board" },
  { id: "polygon", label: "Polygon" },
];

const constraintItems: ConstraintLibraryItem[] = [
  { id: "spring", label: "Spring" },
  { id: "track", label: "Track" },
];

const chipGroups: Array<{ title: string; items: string[] }> = [
  {
    title: "Helpers",
    items: ["Probe", "Ruler", "Angle tool"],
  },
];

export function ObjectLibraryPanel(props: ObjectLibraryPanelProps) {
  const { onSelectItem, onStartBodyDrag, selectedItemId } = props;

  function handleBodyPointerDown(
    bodyKind: LibraryBodyKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 && event.buttons !== 1) {
      return;
    }

    onStartBodyDrag?.({
      bodyKind,
      pointerClientX: event.clientX,
      pointerClientY: event.clientY,
    });
  }

  function handleBodyMouseDown(bodyKind: LibraryBodyKind, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    onStartBodyDrag?.({
      bodyKind,
      pointerClientX: event.clientX,
      pointerClientY: event.clientY,
    });
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section key="Bodies" style={groupStyle}>
        <h2 style={headingStyle}>Bodies</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {bodyItems.map((item) => (
            <button
              key={item.id}
              data-selected="false"
              data-testid={`library-item-${item.id}`}
              style={{
                ...bodyChipStyle,
              }}
              type="button"
              onMouseDown={(event) => handleBodyMouseDown(item.id, event)}
              onPointerDown={(event) => handleBodyPointerDown(item.id, event)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
      <section key="Constraints" style={groupStyle}>
        <h2 style={headingStyle}>Constraints</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {constraintItems.map((item) => (
            <button
              key={item.id}
              data-selected={String(selectedItemId === item.id)}
              data-testid={`library-item-${item.id}`}
              style={{
                ...buttonChipStyle,
                background: selectedItemId === item.id ? "#dbe8ff" : chipStyle.background,
              }}
              type="button"
              onClick={() => onSelectItem(item.id)}
            >
              {item.label}
            </button>
          ))}
          <span style={chipStyle}>Rod</span>
          <span style={chipStyle}>Anchor</span>
        </div>
      </section>
      {chipGroups.map((group) => (
        <section key={group.title} style={groupStyle}>
          <h2 style={headingStyle}>{group.title}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {group.items.map((item) => (
              <span key={item} style={chipStyle}>
                {item}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
