import { useEffect, useState, type CSSProperties } from "react";

import type { SceneDraft, SceneDraftEntity, SceneDraftRelationship } from "../ai/sceneDraft";
import { useI18n, type MessageKey } from "../i18n";

type TextToSceneModalProps = {
  draft: SceneDraft | null;
  errorMessage: string | null;
  generating: boolean;
  onCancel: () => void;
  onGenerateDraft: (prompt: string) => void;
  onInsert: (draft: SceneDraft) => void;
  onReplace: (draft: SceneDraft) => void;
};

const backdropStyle: CSSProperties = {
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.42)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: 24,
  position: "fixed",
  zIndex: 100,
};

const modalStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(108, 128, 173, 0.22)",
  borderRadius: 18,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
  display: "grid",
  gap: 16,
  maxHeight: "88vh",
  maxWidth: 760,
  overflow: "auto",
  padding: 22,
  width: "min(760px, 100%)",
};

const titleStyle: CSSProperties = {
  color: "#18314f",
  fontSize: 20,
  fontWeight: 800,
  margin: 0,
};

const helperStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
};

const textAreaStyle: CSSProperties = {
  border: "1px solid rgba(108, 128, 173, 0.28)",
  borderRadius: 12,
  color: "#18314f",
  font: "inherit",
  minHeight: 140,
  padding: 12,
  resize: "vertical",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const primaryButtonStyle: CSSProperties = {
  background: "#18314f",
  border: "1px solid #18314f",
  borderRadius: 999,
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 700,
  padding: "9px 14px",
};

const secondaryButtonStyle: CSSProperties = {
  background: "#f2f5fb",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  borderRadius: 999,
  color: "#18314f",
  cursor: "pointer",
  fontWeight: 700,
  padding: "9px 14px",
};

const sectionStyle: CSSProperties = {
  background: "#f7f9fd",
  border: "1px solid rgba(108, 128, 173, 0.14)",
  borderRadius: 14,
  display: "grid",
  gap: 10,
  padding: 14,
};

const errorStyle: CSSProperties = {
  ...sectionStyle,
  background: "#fff1f2",
  color: "#9f1239",
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};

const fieldLabelStyle: CSSProperties = {
  color: "#18314f",
  display: "grid",
  fontSize: 12,
  fontWeight: 700,
  gap: 5,
};

const inputStyle: CSSProperties = {
  border: "1px solid rgba(108, 128, 173, 0.24)",
  borderRadius: 10,
  color: "#18314f",
  font: "inherit",
  padding: "7px 9px",
};

const miniSectionStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(108, 128, 173, 0.14)",
  borderRadius: 12,
  display: "grid",
  gap: 9,
  padding: 12,
};

const textListInputStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 42,
  resize: "vertical",
};

type EntityNumericKey =
  | "angleDegrees"
  | "friction"
  | "height"
  | "length"
  | "mass"
  | "radius"
  | "restitution"
  | "sweepAngleDegrees"
  | "thickness"
  | "width";

type RelationshipNumericKey = "gap" | "restLength" | "stiffness" | "totalKineticEnergy";

export function TextToSceneModal(props: TextToSceneModalProps) {
  const [prompt, setPrompt] = useState("");
  const [editableDraft, setEditableDraft] = useState<SceneDraft | null>(props.draft);
  const { t } = useI18n();
  const canApply = editableDraft !== null && !props.generating;

  useEffect(() => {
    setEditableDraft(props.draft);
  }, [props.draft]);

  function handleGenerate() {
    props.onGenerateDraft(prompt);
  }

  function updateDraft(updater: (draft: SceneDraft) => SceneDraft) {
    setEditableDraft((current) => (current ? updater(current) : current));
  }

  return (
    <div aria-modal="true" role="dialog" style={backdropStyle}>
      <div style={modalStyle}>
        <div>
          <h2 style={titleStyle}>{t("aiScene.modal.title")}</h2>
          <p style={helperStyle}>
            {t("aiScene.modal.helper")}
          </p>
        </div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#18314f", fontSize: 13, fontWeight: 700 }}>
            {t("aiScene.prompt")}
          </span>
          <textarea
            aria-label={t("aiScene.prompt")}
            style={textAreaStyle}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <div style={rowStyle}>
          <button
            disabled={props.generating || prompt.trim().length === 0}
            style={primaryButtonStyle}
            type="button"
            onClick={handleGenerate}
          >
            {props.generating ? t("aiScene.generating") : t("aiScene.generateDraft")}
          </button>
          <button style={secondaryButtonStyle} type="button" onClick={props.onCancel}>
            {t("aiScene.cancel")}
          </button>
        </div>

        {props.errorMessage ? <div style={errorStyle}>{props.errorMessage}</div> : null}

        {editableDraft ? (
          <section style={sectionStyle}>
            <div>
              <strong>{editableDraft.title}</strong>
              <p style={helperStyle}>{t("aiScene.reviewHelper")}</p>
            </div>

            <section style={miniSectionStyle}>
              <strong>{t("aiScene.parameters")}</strong>
              <div style={fieldGridStyle}>
                <NumericDraftInput
                  ariaLabel="Edit scene gravity"
                  label={t("aiScene.gravityLabel")}
                  unit="m/s²"
                  value={editableDraft.gravity}
                  onChange={(value) =>
                    updateDraft((draft) => ({
                      ...draft,
                      gravity: value,
                    }))
                  }
                />
              </div>
            </section>

            <EditableEntityList
              draft={editableDraft}
              onEntityNumberChange={(entityIndex, key, value) =>
                updateDraft((draft) => ({
                  ...draft,
                  entities: draft.entities.map((entity, index) =>
                    index === entityIndex
                      ? ({
                          ...entity,
                          [key]: value,
                        } as SceneDraftEntity)
                      : entity,
                  ),
                }))
              }
              onVelocityChange={(entityIndex, axis, value) =>
                updateDraft((draft) => ({
                  ...draft,
                  entities: draft.entities.map((entity, index) =>
                    index === entityIndex
                      ? {
                          ...entity,
                          initialVelocity: {
                            x: axis === "x" ? value ?? 0 : entity.initialVelocity?.x ?? 0,
                            y: axis === "y" ? value ?? 0 : entity.initialVelocity?.y ?? 0,
                          },
                        }
                      : entity,
                  ),
                }))
              }
            />

            <EditableRelationshipList
              draft={editableDraft}
              onRelationshipNumberChange={(relationshipIndex, key, value) =>
                updateDraft((draft) => ({
                  ...draft,
                  relationships: draft.relationships.map((relationship, index) =>
                    index === relationshipIndex
                      ? ({
                          ...relationship,
                          [key]: value,
                        } as SceneDraftRelationship)
                      : relationship,
                  ),
                }))
              }
            />

            <EditableTextList
              emptyLabel={t("aiScene.emptyAssumptions")}
              items={editableDraft.assumptions}
              labelPrefix="Edit assumption"
              title={t("aiScene.assumptions")}
              onChange={(items) =>
                updateDraft((draft) => ({
                  ...draft,
                  assumptions: items,
                }))
              }
            />
            <EditableTextList
              emptyLabel={t("aiScene.emptyWarnings")}
              items={editableDraft.warnings}
              labelPrefix="Edit warning"
              title={t("aiScene.warnings")}
              onChange={(items) =>
                updateDraft((draft) => ({
                  ...draft,
                  warnings: items,
                }))
              }
            />
            <EditableTextList
              emptyLabel={t("aiScene.emptyUnsupported")}
              items={editableDraft.unsupported}
              labelPrefix="Edit unsupported item"
              title={t("aiScene.unsupported")}
              onChange={(items) =>
                updateDraft((draft) => ({
                  ...draft,
                  unsupported: items,
                }))
              }
            />

            <div style={rowStyle}>
              <button
                disabled={!canApply}
                style={primaryButtonStyle}
                type="button"
                onClick={() => {
                  if (editableDraft) {
                    props.onReplace(editableDraft);
                  }
                }}
              >
                {t("aiScene.replace")}
              </button>
              <button
                disabled={!canApply}
                style={secondaryButtonStyle}
                type="button"
                onClick={() => {
                  if (editableDraft) {
                    props.onInsert(editableDraft);
                  }
                }}
              >
                {t("aiScene.insert")}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function EditableEntityList(props: {
  draft: SceneDraft;
  onEntityNumberChange: (entityIndex: number, key: EntityNumericKey, value: number | undefined) => void;
  onVelocityChange: (entityIndex: number, axis: "x" | "y", value: number | undefined) => void;
}) {
  const { t } = useI18n();

  return (
    <section style={miniSectionStyle}>
      <strong>{t("aiScene.objects")}</strong>
      {props.draft.entities.length === 0 ? (
        <p style={helperStyle}>{t("aiScene.emptyObjects")}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {props.draft.entities.map((entity, entityIndex) => (
            <div key={`${entity.name}-${entityIndex}`} style={miniSectionStyle}>
              <strong>{t("aiScene.entityTitle", {
                kind: t(readEntityKindLabelKey(entity.kind)),
                name: entity.name,
              })}</strong>
              <div style={fieldGridStyle}>
                {readEntityNumericKeys(entity).map((key) => (
                  <NumericDraftInput
                    key={key}
                    ariaLabel={`Edit ${entity.name} ${key}`}
                    label={t(readDraftKeyLabelKey(key))}
                    value={entity[key]}
                    onChange={(value) => props.onEntityNumberChange(entityIndex, key, value)}
                  />
                ))}
                <NumericDraftInput
                  ariaLabel={`Edit ${entity.name} velocity x`}
                  label={t("aiScene.field.velocityX")}
                  value={entity.initialVelocity?.x}
                  onChange={(value) => props.onVelocityChange(entityIndex, "x", value)}
                />
                <NumericDraftInput
                  ariaLabel={`Edit ${entity.name} velocity y`}
                  label={t("aiScene.field.velocityY")}
                  value={entity.initialVelocity?.y}
                  onChange={(value) => props.onVelocityChange(entityIndex, "y", value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EditableRelationshipList(props: {
  draft: SceneDraft;
  onRelationshipNumberChange: (
    relationshipIndex: number,
    key: RelationshipNumericKey,
    value: number | undefined,
  ) => void;
}) {
  const { t } = useI18n();
  const editableRelationships = props.draft.relationships
    .map((relationship, index) => ({ index, relationship }))
    .filter(
      ({ relationship }) =>
        relationship.kind === "spring-between" ||
        relationship.kind === "contact-spring-end" ||
        relationship.kind === "energy-release",
    );

  if (editableRelationships.length === 0) {
    return null;
  }

  return (
    <section style={miniSectionStyle}>
      <strong>{t("aiScene.relationships")}</strong>
      <div style={{ display: "grid", gap: 10 }}>
        {editableRelationships.map(({ index, relationship }) => (
          <div key={`${relationship.kind}-${index}`} style={miniSectionStyle}>
            <strong>{formatRelationshipTitle(relationship, t)}</strong>
            <div style={fieldGridStyle}>
              {readRelationshipNumericKeys(relationship).map((key) => (
                <NumericDraftInput
                  key={key}
                  ariaLabel={formatRelationshipAriaLabel(relationship, key)}
                  label={t(readDraftKeyLabelKey(key))}
                  value={relationship[key]}
                  onChange={(value) => props.onRelationshipNumberChange(index, key, value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EditableTextList(props: {
  emptyLabel: string;
  items: string[];
  labelPrefix: string;
  onChange: (items: string[]) => void;
  title: string;
}) {
  return (
    <section style={miniSectionStyle}>
      <strong>{props.title}</strong>
      {props.items.length === 0 ? (
        <p style={helperStyle}>{props.emptyLabel}</p>
      ) : null}
      {props.items.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {props.items.map((item, index) => (
            <textarea
              key={`${props.title}-${index}`}
              aria-label={`${props.labelPrefix} ${index + 1}`}
              style={textListInputStyle}
              value={item}
              onChange={(event) => {
                props.onChange(
                  props.items.map((currentItem, currentIndex) =>
                    currentIndex === index ? event.target.value : currentItem,
                  ),
                );
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function NumericDraftInput(props: {
  ariaLabel: string;
  label: string;
  unit?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span>
        {props.label}
        {props.unit ? ` (${props.unit})` : ""}
      </span>
      <input
        aria-label={props.ariaLabel}
        inputMode="decimal"
        step="any"
        style={inputStyle}
        type="number"
        value={props.value ?? ""}
        onChange={(event) => {
          const rawValue = event.target.value.trim();

          if (rawValue.length === 0) {
            props.onChange(undefined);
            return;
          }

          const parsed = Number(rawValue);

          if (Number.isFinite(parsed)) {
            props.onChange(parsed);
          }
        }}
      />
    </label>
  );
}

function readEntityNumericKeys(entity: SceneDraftEntity): EntityNumericKey[] {
  if (entity.kind === "ball") {
    return ["mass", "radius", "friction", "restitution"];
  }

  if (entity.kind === "board") {
    return ["length", "width", "height", "angleDegrees", "friction", "restitution"];
  }

  if (entity.kind === "arc-track") {
    return ["radius", "sweepAngleDegrees", "angleDegrees", "thickness", "friction"];
  }

  return ["mass", "width", "height", "angleDegrees", "friction", "restitution"];
}

function readRelationshipNumericKeys(relationship: SceneDraftRelationship): RelationshipNumericKey[] {
  if (relationship.kind === "contact-spring-end") {
    return ["gap", "restLength", "stiffness"];
  }

  if (relationship.kind === "spring-between") {
    return ["restLength", "stiffness"];
  }

  if (relationship.kind === "energy-release") {
    return ["totalKineticEnergy"];
  }

  return [];
}

function formatRelationshipTitle(
  relationship: SceneDraftRelationship,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (relationship.kind === "contact-spring-end") {
    return t("aiScene.relationship.contactSpring", {
      anchor: relationship.anchor,
      target: relationship.target,
    });
  }

  if (relationship.kind === "spring-between") {
    return t("aiScene.relationship.spring", {
      entityA: relationship.entityA,
      entityB: relationship.entityB,
    });
  }

  if (relationship.kind === "energy-release") {
    return t("aiScene.relationship.energyRelease", {
      entityA: relationship.entityA,
      entityB: relationship.entityB,
    });
  }

  return relationship.kind;
}

function formatRelationshipAriaLabel(
  relationship: SceneDraftRelationship,
  key: RelationshipNumericKey,
): string {
  if (relationship.kind === "contact-spring-end") {
    return `Edit contact spring ${formatRelationshipKeyForAria(key)} ${relationship.anchor} to ${relationship.target}`;
  }

  if (relationship.kind === "spring-between") {
    return `Edit spring ${formatRelationshipKeyForAria(key)} ${relationship.entityA} to ${relationship.entityB}`;
  }

  if (relationship.kind === "energy-release") {
    return `Edit energy release ${formatRelationshipKeyForAria(key)} ${relationship.entityA} to ${relationship.entityB}`;
  }

  return `Edit relationship ${key}`;
}

function formatRelationshipKeyForAria(key: RelationshipNumericKey): string {
  return key === "restLength" ? "rest length" : key;
}

function readDraftKeyLabelKey(key: EntityNumericKey | RelationshipNumericKey): MessageKey {
  const labels: Record<EntityNumericKey | RelationshipNumericKey, MessageKey> = {
    angleDegrees: "aiScene.field.angle",
    friction: "aiScene.field.friction",
    gap: "aiScene.field.gap",
    height: "aiScene.field.height",
    length: "aiScene.field.length",
    mass: "aiScene.field.mass",
    radius: "aiScene.field.radius",
    restLength: "aiScene.field.restLength",
    restitution: "aiScene.field.restitution",
    stiffness: "aiScene.field.stiffness",
    sweepAngleDegrees: "aiScene.field.sweepAngle",
    thickness: "aiScene.field.thickness",
    totalKineticEnergy: "aiScene.field.totalKineticEnergy",
    width: "aiScene.field.width",
  };

  return labels[key];
}

function readEntityKindLabelKey(kind: SceneDraftEntity["kind"]): MessageKey {
  const labels: Record<SceneDraftEntity["kind"], MessageKey> = {
    "arc-track": "aiScene.entityKind.arcTrack",
    ball: "aiScene.entityKind.ball",
    block: "aiScene.entityKind.block",
    board: "aiScene.entityKind.board",
  };

  return labels[kind];
}
