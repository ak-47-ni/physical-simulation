import type { CSSProperties } from "react";

import type { SceneDisplaySettings } from "../io/sceneFile";
import { useI18n } from "../i18n";
import { localizeSystemCopy } from "../localizeSystemCopy";
import type { ConstraintPlacementState } from "../state/appEditorHelpers";
import {
  ARC_TRACK_SPAN_PRESETS,
  type ArcTrackSpanPresetDegrees,
} from "../state/createBoardAnchoredArcTrackConstraint";
import type { EditorConstraint } from "../state/editorConstraints";
import type { EditorEntityPhysics, EditorSceneEntity } from "../state/editorStore";
import {
  cartesianVelocityToPolar,
  polarVelocityToCartesian,
} from "../state/velocityPolar";
import { MeasurementInput } from "./property/MeasurementInput";
import { ScenePhysicsCard } from "./property/ScenePhysicsCard";

type ConstraintPanelUpdate = {
  axis?: { x: number; y: number };
  center?: { x: number; y: number };
  entryEndpoint?: "start" | "end";
  endAngleDegrees?: number;
  origin?: { x: number; y: number };
  restLength?: number;
  radius?: number;
  side?: "inside" | "outside";
  startAngleDegrees?: number;
  stiffness?: number;
};

type ArcTrackPanelUpdate = {
  radius?: number;
  rotationDegrees?: number;
  sweepAngleDegrees?: number;
};

type ScenePhysicsPanelState = {
  gravity: number;
  gravityUnitLabel: string;
  lengthUnit: string;
  lengthUnitOptions: readonly string[];
  lockReason?: string | null;
  massUnit: string;
  massUnitOptions: readonly string[];
  pixelsPerMeter: number;
  velocityUnit: string;
  velocityUnitOptions: readonly string[];
};

type ScenePhysicsPanelUpdate = {
  gravity?: number;
  lengthUnit?: string;
  massUnit?: string;
  pixelsPerMeter?: number;
  velocityUnit?: string;
};

type PropertyPanelProps = {
  authoringLocked?: boolean;
  authoringLockReason?: string | null;
  display: SceneDisplaySettings;
  onApplyPendingArcSpanPreset?: (spanDegrees: ArcTrackSpanPresetDegrees) => void;
  onDeleteSelectedConstraint?: () => void;
  onDeleteSelectedEntity: () => void;
  onDuplicateSelectedEntity: () => void;
  onScenePhysicsChange?: (scenePhysics: ScenePhysicsPanelUpdate) => void;
  onUpdateDisplaySetting: (display: Partial<SceneDisplaySettings>) => void;
  onUpdateSelectedArcTrack?: (update: ArcTrackPanelUpdate) => void;
  onUpdateSelectedConstraint?: (constraint: ConstraintPanelUpdate) => void;
  onUpdateSelectedEntityLabel: (label: string) => void;
  onUpdateSelectedEntityPosition: (position: { x: number; y: number }) => void;
  onUpdateSelectedEntityPhysics: (physics: Partial<EditorEntityPhysics>) => void;
  onUpdateSelectedEntityRadius: (radius: number) => void;
  onUpdateSelectedEntityRotation?: (rotationDegrees: number) => void;
  onUpdateSelectedEntitySize: (size: { width: number; height: number }) => void;
  pendingConstraintPlacement?: ConstraintPlacementState | null;
  scenePhysics?: ScenePhysicsPanelState | null;
  selectedConstraint?: EditorConstraint | null;
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

const semanticsNoteStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "#ffffff",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

const collisionSemanticsHintStyle: CSSProperties = {
  color: "#5d6f88",
  fontSize: "12px",
  lineHeight: 1.5,
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
  ariaLabel?: string;
  disabled?: boolean;
  label: string;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  if (props.suffix) {
    return (
      <MeasurementInput
        disabled={props.disabled}
        label={props.label}
        suffix={props.suffix}
        value={props.value}
        onChange={props.onChange}
      />
    );
  }

  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <input
        aria-label={props.ariaLabel ?? props.label}
        disabled={props.disabled}
        style={inputStyle}
        type="number"
        value={props.value}
        onChange={(event) => {
          if (props.disabled) {
            return;
          }

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
  disabled?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <input
        aria-label={props.label}
        disabled={props.disabled}
        style={textInputStyle}
        type="text"
        value={props.value}
        onChange={(event) => {
          if (props.disabled) {
            return;
          }

          props.onChange(event.target.value);
        }}
      />
    </label>
  );
}

function SelectInput(props: {
  disabled?: boolean;
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <select
        aria-label={props.label}
        disabled={props.disabled}
        style={inputStyle}
        value={props.value}
        onChange={(event) => {
          if (props.disabled) {
            return;
          }

          props.onChange(event.target.value);
        }}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxInput(props: {
  disabled?: boolean;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: "#17304f",
        fontSize: "13px",
      }}
    >
      <input
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        type="checkbox"
        onChange={(event) => {
          if (props.disabled) {
            return;
          }

          props.onChange(event.target.checked);
        }}
      />
      {props.label}
    </label>
  );
}

function createArcTrackSpanPresetUpdate(
  constraint: Extract<EditorConstraint, { kind: "arc-track" }>,
  spanDegrees: ArcTrackSpanPresetDegrees,
) {
  if (constraint.entryEndpoint === "start") {
    return {
      endAngleDegrees: constraint.startAngleDegrees + spanDegrees,
      startAngleDegrees: constraint.startAngleDegrees,
    };
  }

  return {
    endAngleDegrees: constraint.endAngleDegrees,
    startAngleDegrees: constraint.endAngleDegrees - spanDegrees,
  };
}

function translateEndpoint(
  endpoint: "start" | "end",
  t: ReturnType<typeof useI18n>["t"],
): string {
  return endpoint === "start" ? t("property.endpoint.start") : t("property.endpoint.end");
}

export function PropertyPanel(props: PropertyPanelProps) {
  const { locale, t } = useI18n();
  const {
    authoringLocked = false,
    authoringLockReason = null,
    display,
    onApplyPendingArcSpanPreset = () => undefined,
    onDeleteSelectedConstraint = () => undefined,
    onDeleteSelectedEntity,
    onDuplicateSelectedEntity,
    onScenePhysicsChange = () => undefined,
    onUpdateDisplaySetting,
    onUpdateSelectedArcTrack = () => undefined,
    onUpdateSelectedConstraint = () => undefined,
    onUpdateSelectedEntityLabel,
    onUpdateSelectedEntityPosition,
    onUpdateSelectedEntityPhysics,
    onUpdateSelectedEntityRadius,
    onUpdateSelectedEntityRotation = () => undefined,
    onUpdateSelectedEntitySize,
    pendingConstraintPlacement = null,
    scenePhysics = null,
    selectedConstraint = null,
    selectedEntity,
  } = props;
  const lengthUnitLabel = scenePhysics?.lengthUnit ?? null;
  const velocityUnitLabel = scenePhysics?.velocityUnit ?? null;
  const massUnitLabel = scenePhysics?.massUnit ?? null;
  const selectionLockReason = authoringLocked ? authoringLockReason : null;
  const scenePhysicsLockReason = scenePhysics?.lockReason ?? selectionLockReason;
  const selectedVelocityPolar = selectedEntity
    ? selectedEntity.kind === "arc-track"
      ? null
      : cartesianVelocityToPolar({
          velocityX: selectedEntity.velocityX,
          velocityY: selectedEntity.velocityY,
        })
    : null;
  const showsEditableFriction = selectedEntity?.kind === "board";
  const showsCollisionSemanticsHint =
    selectedEntity !== null && selectedEntity.kind !== "arc-track";

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {scenePhysics ? (
        <ScenePhysicsCard
          disabled={authoringLocked}
          gravity={scenePhysics.gravity}
          gravityUnitLabel={scenePhysics.gravityUnitLabel}
          lengthUnit={scenePhysics.lengthUnit}
          lengthUnitOptions={scenePhysics.lengthUnitOptions}
          lockReason={scenePhysicsLockReason}
          massUnit={scenePhysics.massUnit}
          massUnitOptions={scenePhysics.massUnitOptions}
          pixelsPerMeter={scenePhysics.pixelsPerMeter}
          velocityUnit={scenePhysics.velocityUnit}
          velocityUnitOptions={scenePhysics.velocityUnitOptions}
          onGravityChange={(gravity) => onScenePhysicsChange({ gravity })}
          onLengthUnitChange={(lengthUnit) => onScenePhysicsChange({ lengthUnit })}
          onMassUnitChange={(massUnit) => onScenePhysicsChange({ massUnit })}
          onPixelsPerMeterChange={(pixelsPerMeter) => onScenePhysicsChange({ pixelsPerMeter })}
          onVelocityUnitChange={(velocityUnit) => onScenePhysicsChange({ velocityUnit })}
        />
      ) : null}

      {pendingConstraintPlacement?.kind === "arc-track" &&
      pendingConstraintPlacement.stage === "pick-span" ? (
        <section style={cardStyle}>
          <h2 style={sectionLabelStyle}>{t("property.pendingArcTrack.title")}</h2>
          <span style={{ color: "#55657f", fontSize: "14px" }}>
            {localizeSystemCopy(pendingConstraintPlacement.hint, t)}
          </span>
          {pendingConstraintPlacement.draftRadius !== null &&
          pendingConstraintPlacement.draftRadius !== undefined &&
          lengthUnitLabel ? (
            <strong style={{ color: "#17304f" }}>
              {t("property.pendingArcTrack.radius", {
                unit: lengthUnitLabel,
                value: pendingConstraintPlacement.draftRadius,
              })}
            </strong>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {ARC_TRACK_SPAN_PRESETS.map((spanDegrees) => (
              <button
                key={spanDegrees}
                disabled={authoringLocked}
                style={actionButtonStyle}
                type="button"
                onClick={() => onApplyPendingArcSpanPreset(spanDegrees)}
              >
                {t("property.pendingArcTrack.createArc", { degrees: spanDegrees })}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section style={cardStyle}>
        <h2 style={sectionLabelStyle}>{t("property.selection.title")}</h2>
        <div style={semanticsNoteStyle}>
          <span style={{ color: "#17304f", fontSize: "13px", fontWeight: 600 }}>
            {t("property.selection.contactSemanticsTitle")}
          </span>
          <span style={{ color: "#5d6f88", fontSize: "13px" }}>
            {t("property.selection.contactSemanticsSubtitle")}
          </span>
        </div>
        {selectionLockReason ? (
          <span style={{ color: "#9a3412", fontSize: "13px", lineHeight: 1.5 }}>
            {localizeSystemCopy(selectionLockReason, t)}
          </span>
        ) : null}
        {selectedConstraint ? (
          <>
            <ReadonlyField label={t("property.field.constraint")} value={selectedConstraint.label} />
            {selectedConstraint.kind === "spring" ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <ReadonlyField
                    label={t("property.field.bodyA")}
                    value={selectedConstraint.entityAId ?? t("property.field.unassigned")}
                  />
                  <ReadonlyField
                    label={t("property.field.bodyB")}
                    value={selectedConstraint.entityBId ?? t("property.field.unassigned")}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.restLength")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.restLength}
                    onChange={(restLength) => onUpdateSelectedConstraint({ restLength })}
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.stiffness")}
                    value={selectedConstraint.stiffness}
                    onChange={(stiffness) => onUpdateSelectedConstraint({ stiffness })}
                  />
                </div>
              </>
            ) : selectedConstraint.kind === "track" ? (
              <>
                <ReadonlyField
                  label={t("property.field.attachedEntity")}
                  value={selectedConstraint.entityId ?? t("property.field.unassigned")}
                />
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.originX")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.origin.x}
                    onChange={(x) =>
                      onUpdateSelectedConstraint({
                        origin: { x, y: selectedConstraint.origin.y },
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.originY")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.origin.y}
                    onChange={(y) =>
                      onUpdateSelectedConstraint({
                        origin: { x: selectedConstraint.origin.x, y },
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.axisX")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.axis.x}
                    onChange={(x) =>
                      onUpdateSelectedConstraint({
                        axis: { x, y: selectedConstraint.axis.y },
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.axisY")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.axis.y}
                    onChange={(y) =>
                      onUpdateSelectedConstraint({
                        axis: { x: selectedConstraint.axis.x, y },
                      })
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.centerX")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.center.x}
                    onChange={(x) =>
                      onUpdateSelectedConstraint({
                        center: { x, y: selectedConstraint.center.y },
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.centerY")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.center.y}
                    onChange={(y) =>
                      onUpdateSelectedConstraint({
                        center: { x: selectedConstraint.center.x, y },
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.radius")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.radius}
                    onChange={(radius) => onUpdateSelectedConstraint({ radius })}
                  />
                  <SelectInput
                    disabled={authoringLocked}
                    label={t("property.field.side")}
                    options={[
                      { label: t("property.side.inside"), value: "inside" },
                      { label: t("property.side.outside"), value: "outside" },
                    ]}
                    value={selectedConstraint.side}
                    onChange={(side) =>
                      onUpdateSelectedConstraint({
                        side: side as "inside" | "outside",
                      })
                    }
                  />
                  <SelectInput
                    disabled={authoringLocked}
                    label={t("property.field.entryEndpoint")}
                    options={[
                      { label: t("property.endpoint.start"), value: "start" },
                      { label: t("property.endpoint.end"), value: "end" },
                    ]}
                    value={selectedConstraint.entryEndpoint}
                    onChange={(entryEndpoint) =>
                      onUpdateSelectedConstraint({
                        entryEndpoint: entryEndpoint as "start" | "end",
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.startAngle")}
                    value={selectedConstraint.startAngleDegrees}
                    onChange={(startAngleDegrees) =>
                      onUpdateSelectedConstraint({ startAngleDegrees })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.endAngle")}
                    value={selectedConstraint.endAngleDegrees}
                    onChange={(endAngleDegrees) =>
                      onUpdateSelectedConstraint({ endAngleDegrees })
                    }
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {ARC_TRACK_SPAN_PRESETS.map((spanDegrees) => (
                    <button
                      key={spanDegrees}
                      disabled={authoringLocked}
                      style={actionButtonStyle}
                      type="button"
                    onClick={() =>
                        onUpdateSelectedConstraint(
                          createArcTrackSpanPresetUpdate(selectedConstraint, spanDegrees),
                        )
                      }
                    >
                      {t("property.action.applySpan", { degrees: spanDegrees })}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              disabled={authoringLocked}
              style={dangerButtonStyle}
              type="button"
              onClick={onDeleteSelectedConstraint}
            >
              {t("property.action.deleteConstraint")}
            </button>
          </>
        ) : selectedEntity ? (
          <>
            <TextInput
              disabled={authoringLocked}
              label={t("property.field.entityName")}
              value={selectedEntity.label}
              onChange={onUpdateSelectedEntityLabel}
            />
            {selectedEntity.kind === "arc-track" ? (
              <>
                <ReadonlyField
                  label={t("property.field.anchor")}
                  value={`${selectedEntity.anchorEntityKind}:${selectedEntity.anchorEntityId} (${selectedEntity.anchorEndpoint})`}
                />
                <ReadonlyField
                  label={t("property.field.entryEndpoint")}
                  value={
                    locale === "en"
                      ? selectedEntity.entryEndpoint
                      : translateEndpoint(selectedEntity.entryEndpoint, t)
                  }
                />
                <div style={semanticsNoteStyle}>
                  <span style={{ color: "#17304f", fontSize: "13px", fontWeight: 600 }}>
                    {t("property.arcTrack.rigidShellTitle")}
                  </span>
                  <span style={{ color: "#5d6f88", fontSize: "13px", lineHeight: 1.5 }}>
                    {t("property.arcTrack.rigidShellDescription")}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.radius")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedEntity.radius}
                    onChange={(radius) => onUpdateSelectedArcTrack({ radius })}
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.sweepAngle")}
                    suffix="°"
                    value={selectedEntity.sweepAngleDegrees}
                    onChange={(sweepAngleDegrees) =>
                      onUpdateSelectedArcTrack({ sweepAngleDegrees })
                    }
                  />
                </div>
                <PositionInput
                  disabled={authoringLocked}
                  label={t("property.field.rotation")}
                  suffix="°"
                  value={selectedEntity.rotationDegrees}
                  onChange={(rotationDegrees) =>
                    onUpdateSelectedArcTrack({ rotationDegrees })
                  }
                />
              </>
            ) : (
              <>
                <ReadonlyField
                  label={t("property.field.position")}
                  value={
                    lengthUnitLabel
                      ? `${selectedEntity.x} ${lengthUnitLabel}, ${selectedEntity.y} ${lengthUnitLabel}`
                      : `${selectedEntity.x}, ${selectedEntity.y}`
                  }
                />
                {velocityUnitLabel ? (
                  <ReadonlyField
                    label={t("property.field.velocity")}
                    value={`${selectedEntity.velocityX} ${velocityUnitLabel}, ${selectedEntity.velocityY} ${velocityUnitLabel}`}
                  />
                ) : null}
                {massUnitLabel ? (
                  <ReadonlyField
                    label={t("property.field.mass")}
                    value={`${selectedEntity.mass} ${massUnitLabel}`}
                  />
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.positionX")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedEntity.x}
                    onChange={(x) => onUpdateSelectedEntityPosition({ x, y: selectedEntity.y })}
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.positionY")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedEntity.y}
                    onChange={(y) => onUpdateSelectedEntityPosition({ x: selectedEntity.x, y })}
                  />
                </div>
                {selectedEntity.kind === "ball" ? (
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.radius")}
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedEntity.radius}
                    onChange={onUpdateSelectedEntityRadius}
                  />
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    }}
                  >
                    <PositionInput
                      disabled={authoringLocked}
                      label={t("property.field.width")}
                      suffix={lengthUnitLabel ?? undefined}
                      value={selectedEntity.width}
                      onChange={(width) =>
                        onUpdateSelectedEntitySize({ width, height: selectedEntity.height })
                      }
                    />
                    <PositionInput
                      disabled={authoringLocked}
                      label={t("property.field.height")}
                      suffix={lengthUnitLabel ?? undefined}
                      value={selectedEntity.height}
                      onChange={(height) =>
                        onUpdateSelectedEntitySize({ width: selectedEntity.width, height })
                      }
                    />
                  </div>
                )}
                {selectedEntity.kind !== "ball" ? (
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.angle")}
                    suffix="°"
                    value={selectedEntity.rotationDegrees ?? 0}
                    onChange={onUpdateSelectedEntityRotation}
                  />
                ) : null}
                {showsCollisionSemanticsHint ? (
                  <span style={collisionSemanticsHintStyle}>
                    {t("property.collisionSemanticsHint")}
                  </span>
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.mass")}
                    suffix={massUnitLabel ?? undefined}
                    value={selectedEntity.mass}
                    onChange={(mass) => onUpdateSelectedEntityPhysics({ mass })}
                  />
                  {showsEditableFriction ? (
                    <PositionInput
                      ariaLabel="Friction"
                      disabled={authoringLocked}
                      label={t("property.field.surfaceFriction")}
                      value={selectedEntity.friction}
                      onChange={(friction) => onUpdateSelectedEntityPhysics({ friction })}
                    />
                  ) : null}
                  <PositionInput
                    ariaLabel="Restitution"
                    disabled={authoringLocked}
                    label={t("property.field.bounce")}
                    value={selectedEntity.restitution}
                    onChange={(restitution) => onUpdateSelectedEntityPhysics({ restitution })}
                  />
                  <CheckboxInput
                    disabled={authoringLocked}
                    label={t("property.field.lockedInSimulation")}
                    checked={selectedEntity.locked}
                    onChange={(locked) => onUpdateSelectedEntityPhysics({ locked })}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.velocityX")}
                    suffix={velocityUnitLabel ?? undefined}
                    value={selectedEntity.velocityX}
                    onChange={(velocityX) => onUpdateSelectedEntityPhysics({ velocityX })}
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.velocityY")}
                    suffix={velocityUnitLabel ?? undefined}
                    value={selectedEntity.velocityY}
                    onChange={(velocityY) => onUpdateSelectedEntityPhysics({ velocityY })}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.speed")}
                    suffix={velocityUnitLabel ?? undefined}
                    value={selectedVelocityPolar?.speed ?? 0}
                    onChange={(speed) =>
                      onUpdateSelectedEntityPhysics(
                        polarVelocityToCartesian({
                          directionDegrees: selectedVelocityPolar?.directionDegrees ?? 0,
                          speed,
                        }),
                      )
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label={t("property.field.direction")}
                    suffix="°"
                    value={selectedVelocityPolar?.directionDegrees ?? 0}
                    onChange={(directionDegrees) =>
                      onUpdateSelectedEntityPhysics(
                        polarVelocityToCartesian({
                          directionDegrees,
                          speed: selectedVelocityPolar?.speed ?? 0,
                        }),
                      )
                    }
                  />
                </div>
              </>
            )}
            <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <button
                disabled={authoringLocked}
                style={actionButtonStyle}
                type="button"
                onClick={onDuplicateSelectedEntity}
              >
                {t("property.action.duplicateEntity")}
              </button>
              <button
                disabled={authoringLocked}
                style={dangerButtonStyle}
                type="button"
                onClick={onDeleteSelectedEntity}
              >
                {t("property.action.deleteEntity")}
              </button>
            </div>
          </>
        ) : (
          <span style={{ color: "#55657f", fontSize: "14px" }}>
            {t("property.empty.noEntitySelected")}
          </span>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={sectionLabelStyle}>{t("property.display.title")}</h2>
        <CheckboxInput
          label={t("property.display.showGrid")}
          checked={display.gridVisible}
          onChange={(gridVisible) => onUpdateDisplaySetting({ gridVisible })}
        />
        <CheckboxInput
          label={t("property.display.showLabels")}
          checked={display.showLabels}
          onChange={(showLabels) => onUpdateDisplaySetting({ showLabels })}
        />
        <CheckboxInput
          label={t("property.display.showTrajectories")}
          checked={display.showTrajectories}
          onChange={(showTrajectories) => onUpdateDisplaySetting({ showTrajectories })}
        />
        <CheckboxInput
          label={t("property.display.showVelocityVectors")}
          checked={display.showVelocityVectors}
          onChange={(showVelocityVectors) => onUpdateDisplaySetting({ showVelocityVectors })}
        />
        <CheckboxInput
          label={t("property.display.showForceVectors")}
          checked={display.showForceVectors}
          onChange={(showForceVectors) => onUpdateDisplaySetting({ showForceVectors })}
        />
      </section>
    </div>
  );
}
