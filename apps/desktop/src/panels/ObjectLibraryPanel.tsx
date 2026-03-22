import type { CSSProperties } from "react";

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

const groups = [
  {
    title: "Bodies",
    items: ["Ball", "Block", "Board", "Polygon"],
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

export function ObjectLibraryPanel() {
  return (
    <div style={{ display: "grid", gap: "18px" }}>
      {groups.map((group) => (
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
