import type { CSSProperties } from "react";

import type { LibraryBodyKind } from "../state/editorStore";

type ObjectLibraryPanelProps = {
  onSelectItem: (itemId: LibraryBodyKind) => void;
  selectedItemId: LibraryBodyKind;
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

const groups = [
  {
    title: "Bodies",
    items: [
      { id: "ball", label: "Ball" },
      { id: "block", label: "Block" },
      { id: "board", label: "Board" },
      { id: "polygon", label: "Polygon" },
    ] satisfies Array<{ id: LibraryBodyKind; label: string }>,
  },
  {
    title: "Constraints",
    items: ["Spring", "Rod", "Track", "Anchor"],
  },
  {
    title: "Helpers",
    items: ["Probe", "Ruler", "Angle tool"],
  },
];

export function ObjectLibraryPanel(props: ObjectLibraryPanelProps) {
  const { onSelectItem, selectedItemId } = props;

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      {groups.map((group) => (
        <section key={group.title} style={groupStyle}>
          <h2 style={headingStyle}>{group.title}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {group.title === "Bodies"
              ? group.items.map((item) => (
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
                ))
              : group.items.map((item) => (
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
