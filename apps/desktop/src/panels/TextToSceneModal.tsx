import { useState, type CSSProperties } from "react";

import type { SceneDraft } from "../ai/sceneDraft";
import { useI18n } from "../i18n";

type TextToSceneModalProps = {
  draft: SceneDraft | null;
  errorMessage: string | null;
  generating: boolean;
  onCancel: () => void;
  onGenerateDraft: (prompt: string) => void;
  onInsert: () => void;
  onReplace: () => void;
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

const listStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  margin: 0,
  paddingLeft: 18,
};

const errorStyle: CSSProperties = {
  ...sectionStyle,
  background: "#fff1f2",
  color: "#9f1239",
};

export function TextToSceneModal(props: TextToSceneModalProps) {
  const [prompt, setPrompt] = useState("");
  const { t } = useI18n();
  const canApply = props.draft !== null && !props.generating;

  function handleGenerate() {
    props.onGenerateDraft(prompt);
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

        {props.draft ? (
          <section style={sectionStyle}>
            <div>
              <strong>{props.draft.title}</strong>
              <p style={helperStyle}>
                {t("aiScene.gravity", {
                  value: props.draft.gravity ?? t("aiScene.defaultValue"),
                })}
              </p>
            </div>

            <PreviewList
              emptyLabel={t("aiScene.emptyObjects")}
              items={props.draft.entities.map((entity) => entity.name)}
              title={t("aiScene.objects")}
            />
            <PreviewList
              emptyLabel={t("aiScene.emptyAssumptions")}
              items={props.draft.assumptions}
              title={t("aiScene.assumptions")}
            />
            <PreviewList
              emptyLabel={t("aiScene.emptyWarnings")}
              items={props.draft.warnings}
              title={t("aiScene.warnings")}
            />
            <PreviewList
              emptyLabel={t("aiScene.emptyUnsupported")}
              items={props.draft.unsupported}
              title={t("aiScene.unsupported")}
            />

            <div style={rowStyle}>
              <button
                disabled={!canApply}
                style={primaryButtonStyle}
                type="button"
                onClick={props.onReplace}
              >
                {t("aiScene.replace")}
              </button>
              <button
                disabled={!canApply}
                style={secondaryButtonStyle}
                type="button"
                onClick={props.onInsert}
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

function PreviewList(props: {
  emptyLabel: string;
  items: string[];
  title: string;
}) {
  return (
    <div>
      <strong>{props.title}</strong>
      {props.items.length === 0 ? (
        <p style={helperStyle}>{props.emptyLabel}</p>
      ) : (
        <ul style={listStyle}>
          {props.items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
