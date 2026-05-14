import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import type { LibraryConstraintKind } from "../state/editorConstraints";
import type { LibraryBodyKind, LibraryItemKind } from "../state/editorStore";
import type { LibraryDragSession } from "../workspace/libraryDragSession";
import { useI18n } from "../i18n";

type ObjectLibraryPanelProps = {
  onSelectItem: (itemId: LibraryItemKind) => void;
  onStartBodyDrag?: (session: LibraryDragSession) => void;
  selectedItemId: LibraryItemKind;
};

type BodyLibraryItem = {
  id: LibraryBodyKind;
  labelKey:
    | "library.item.arcTrack"
    | "library.item.particle"
    | "library.item.ball"
    | "library.item.block"
    | "library.item.board"
    | "library.item.polygon";
};

type ConstraintLibraryItem = {
  id: LibraryConstraintKind;
  labelKey: "library.item.spring" | "library.item.track";
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
  { id: "particle", labelKey: "library.item.particle" },
  { id: "ball", labelKey: "library.item.ball" },
  { id: "block", labelKey: "library.item.block" },
  { id: "board", labelKey: "library.item.board" },
  { id: "polygon", labelKey: "library.item.polygon" },
  { id: "arc-track", labelKey: "library.item.arcTrack" },
];

const constraintItems: ConstraintLibraryItem[] = [
  { id: "spring", labelKey: "library.item.spring" },
  { id: "track", labelKey: "library.item.track" },
];

const chipGroups = [
  {
    titleKey: "library.group.helpers" as const,
    items: [
      "library.item.probe",
      "library.item.ruler",
      "library.item.angleTool",
    ] as const,
  },
];

export function ObjectLibraryPanel(props: ObjectLibraryPanelProps) {
  const { onSelectItem, onStartBodyDrag } = props;
  const { t } = useI18n();

  function handleBodyPointerDown(
    bodyKind: LibraryBodyKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.button !== 0 && event.buttons !== 1) {
      return;
    }

    onStartBodyDrag?.({
      bodyKind,
      pointerClientPx: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  }

  function handleBodyMouseDown(bodyKind: LibraryBodyKind, event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    onStartBodyDrag?.({
      bodyKind,
      pointerClientPx: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  }

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section key="Bodies" style={groupStyle}>
        <h2 style={headingStyle}>{t("library.group.bodies")}</h2>
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
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </section>
      <section key="Constraints" style={groupStyle}>
        <h2 style={headingStyle}>{t("library.group.constraints")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {constraintItems.map((item) => (
            <button
              key={item.id}
              data-selected="false"
              data-testid={`library-item-${item.id}`}
              style={{
                ...buttonChipStyle,
              }}
              type="button"
              onClick={() => onSelectItem(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
          <span style={chipStyle}>{t("library.item.rod")}</span>
          <span style={chipStyle}>{t("library.item.anchor")}</span>
        </div>
      </section>
      {chipGroups.map((group) => (
        <section key={group.titleKey} style={groupStyle}>
          <h2 style={headingStyle}>{t(group.titleKey)}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {group.items.map((item) => (
              <span key={item} style={chipStyle}>
                {t(item)}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
