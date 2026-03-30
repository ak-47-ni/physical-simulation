import type { CSSProperties } from "react";

import type { SceneDisplaySettings } from "../io/sceneFile";
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
  endAngleDegrees?: number;
  origin?: { x: number; y: number };
  restLength?: number;
  radius?: number;
  side?: "inside" | "outside";
  startAngleDegrees?: number;
  stiffness?: number;
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
  onDeleteSelectedConstraint?: () => void;
  onDeleteSelectedEntity: () => void;
  onDuplicateSelectedEntity: () => void;
  onScenePhysicsChange?: (scenePhysics: ScenePhysicsPanelUpdate) => void;
  onUpdateDisplaySetting: (display: Partial<SceneDisplaySettings>) => void;
  onUpdateSelectedConstraint?: (constraint: ConstraintPanelUpdate) => void;
  onUpdateSelectedEntityLabel: (label: string) => void;
  onUpdateSelectedEntityPosition: (position: { x: number; y: number }) => void;
  onUpdateSelectedEntityPhysics: (physics: Partial<EditorEntityPhysics>) => void;
  onUpdateSelectedEntityRadius: (radius: number) => void;
  onUpdateSelectedEntityRotation?: (rotationDegrees: number) => void;
  onUpdateSelectedEntitySize: (size: { width: number; height: number }) => void;
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

function ReadonlyField(props: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <span style={{ color: "#6a7890", fontSize: "12px" }}>{props.label}</span>
      <strong style={{ color: "#17304f", fontSize: "14px" }}>{props.value}</strong>
    </div>
  );
}

function PositionInput(props: {
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
        aria-label={props.label}
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

export function PropertyPanel(props: PropertyPanelProps) {
  const {
    authoringLocked = false,
    authoringLockReason = null,
    display,
    onDeleteSelectedConstraint = () => undefined,
    onDeleteSelectedEntity,
    onDuplicateSelectedEntity,
    onScenePhysicsChange = () => undefined,
    onUpdateDisplaySetting,
    onUpdateSelectedConstraint = () => undefined,
    onUpdateSelectedEntityLabel,
    onUpdateSelectedEntityPosition,
    onUpdateSelectedEntityPhysics,
    onUpdateSelectedEntityRadius,
    onUpdateSelectedEntityRotation = () => undefined,
    onUpdateSelectedEntitySize,
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
    ? cartesianVelocityToPolar({
        velocityX: selectedEntity.velocityX,
        velocityY: selectedEntity.velocityY,
      })
    : null;

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

      <section style={cardStyle}>
        <h2 style={sectionLabelStyle}>Selection</h2>
        {selectionLockReason ? (
          <span style={{ color: "#9a3412", fontSize: "13px", lineHeight: 1.5 }}>
            {selectionLockReason}
          </span>
        ) : null}
        {selectedConstraint ? (
          <>
            <ReadonlyField label="Constraint" value={selectedConstraint.label} />
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
                    label="Body A"
                    value={selectedConstraint.entityAId ?? "Unassigned"}
                  />
                  <ReadonlyField
                    label="Body B"
                    value={selectedConstraint.entityBId ?? "Unassigned"}
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
                    label="Rest length"
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.restLength}
                    onChange={(restLength) => onUpdateSelectedConstraint({ restLength })}
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label="Stiffness"
                    value={selectedConstraint.stiffness}
                    onChange={(stiffness) => onUpdateSelectedConstraint({ stiffness })}
                  />
                </div>
              </>
            ) : selectedConstraint.kind === "track" ? (
              <>
                <ReadonlyField
                  label="Attached entity"
                  value={selectedConstraint.entityId ?? "Unassigned"}
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
                    label="Origin X"
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
                    label="Origin Y"
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
                    label="Axis X"
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
                    label="Axis Y"
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
                <ReadonlyField
                  label="Attached entity"
                  value={selectedConstraint.entityId ?? "Unassigned"}
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
                    label="Center X"
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
                    label="Center Y"
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
                    label="Radius"
                    suffix={lengthUnitLabel ?? undefined}
                    value={selectedConstraint.radius}
                    onChange={(radius) => onUpdateSelectedConstraint({ radius })}
                  />
                  <SelectInput
                    disabled={authoringLocked}
                    label="Side"
                    options={[
                      { label: "Inside", value: "inside" },
                      { label: "Outside", value: "outside" },
                    ]}
                    value={selectedConstraint.side}
                    onChange={(side) =>
                      onUpdateSelectedConstraint({
                        side: side as "inside" | "outside",
                      })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label="Start angle"
                    value={selectedConstraint.startAngleDegrees}
                    onChange={(startAngleDegrees) =>
                      onUpdateSelectedConstraint({ startAngleDegrees })
                    }
                  />
                  <PositionInput
                    disabled={authoringLocked}
                    label="End angle"
                    value={selectedConstraint.endAngleDegrees}
                    onChange={(endAngleDegrees) =>
                      onUpdateSelectedConstraint({ endAngleDegrees })
                    }
                  />
                </div>
              </>
            )}
            <button
              disabled={authoringLocked}
              style={dangerButtonStyle}
              type="button"
              onClick={onDeleteSelectedConstraint}
            >
              Delete constraint
            </button>
          </>
        ) : selectedEntity ? (
          <>
            <TextInput
              disabled={authoringLocked}
              label="Entity name"
              value={selectedEntity.label}
              onChange={onUpdateSelectedEntityLabel}
            />
            <ReadonlyField
              label="Position"
              value={
                lengthUnitLabel
                  ? `${selectedEntity.x} ${lengthUnitLabel}, ${selectedEntity.y} ${lengthUnitLabel}`
                  : `${selectedEntity.x}, ${selectedEntity.y}`
              }
            />
            {velocityUnitLabel ? (
              <ReadonlyField
                label="Velocity"
                value={`${selectedEntity.velocityX} ${velocityUnitLabel}, ${selectedEntity.velocityY} ${velocityUnitLabel}`}
              />
            ) : null}
            {massUnitLabel ? (
              <ReadonlyField label="Mass" value={`${selectedEntity.mass} ${massUnitLabel}`} />
            ) : null}
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <PositionInput
                disabled={authoringLocked}
                label="Position X"
                suffix={lengthUnitLabel ?? undefined}
                value={selectedEntity.x}
                onChange={(x) => onUpdateSelectedEntityPosition({ x, y: selectedEntity.y })}
              />
              <PositionInput
                disabled={authoringLocked}
                label="Position Y"
                suffix={lengthUnitLabel ?? undefined}
                value={selectedEntity.y}
                onChange={(y) => onUpdateSelectedEntityPosition({ x: selectedEntity.x, y })}
              />
            </div>
            {selectedEntity.kind === "ball" ? (
              <PositionInput
                disabled={authoringLocked}
                label="Radius"
                suffix={lengthUnitLabel ?? undefined}
                value={selectedEntity.radius}
                onChange={onUpdateSelectedEntityRadius}
              />
            ) : (
              <div
                style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
              >
                <PositionInput
                  disabled={authoringLocked}
                  label="Width"
                  suffix={lengthUnitLabel ?? undefined}
                  value={selectedEntity.width}
                  onChange={(width) =>
                    onUpdateSelectedEntitySize({ width, height: selectedEntity.height })
                  }
                />
                <PositionInput
                  disabled={authoringLocked}
                  label="Height"
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
                label="Angle"
                suffix="°"
                value={selectedEntity.rotationDegrees ?? 0}
                onChange={onUpdateSelectedEntityRotation}
              />
            ) : null}
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <PositionInput
                disabled={authoringLocked}
                label="Mass"
                suffix={massUnitLabel ?? undefined}
                value={selectedEntity.mass}
                onChange={(mass) => onUpdateSelectedEntityPhysics({ mass })}
              />
              <PositionInput
                disabled={authoringLocked}
                label="Friction"
                value={selectedEntity.friction}
                onChange={(friction) => onUpdateSelectedEntityPhysics({ friction })}
              />
              <PositionInput
                disabled={authoringLocked}
                label="Restitution"
                value={selectedEntity.restitution}
                onChange={(restitution) => onUpdateSelectedEntityPhysics({ restitution })}
              />
              <CheckboxInput
                disabled={authoringLocked}
                label="Locked in simulation"
                checked={selectedEntity.locked}
                onChange={(locked) => onUpdateSelectedEntityPhysics({ locked })}
              />
            </div>
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <PositionInput
                disabled={authoringLocked}
                label="Velocity X"
                suffix={velocityUnitLabel ?? undefined}
                value={selectedEntity.velocityX}
                onChange={(velocityX) => onUpdateSelectedEntityPhysics({ velocityX })}
              />
              <PositionInput
                disabled={authoringLocked}
                label="Velocity Y"
                suffix={velocityUnitLabel ?? undefined}
                value={selectedEntity.velocityY}
                onChange={(velocityY) => onUpdateSelectedEntityPhysics({ velocityY })}
              />
            </div>
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <PositionInput
                disabled={authoringLocked}
                label="Speed"
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
                label="Direction"
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
            <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <button
                disabled={authoringLocked}
                style={actionButtonStyle}
                type="button"
                onClick={onDuplicateSelectedEntity}
              >
                Duplicate entity
              </button>
              <button
                disabled={authoringLocked}
                style={dangerButtonStyle}
                type="button"
                onClick={onDeleteSelectedEntity}
              >
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
        <CheckboxInput
          label="Show grid"
          checked={display.gridVisible}
          onChange={(gridVisible) => onUpdateDisplaySetting({ gridVisible })}
        />
        <CheckboxInput
          label="Show labels"
          checked={display.showLabels}
          onChange={(showLabels) => onUpdateDisplaySetting({ showLabels })}
        />
        <CheckboxInput
          label="Show trajectories"
          checked={display.showTrajectories}
          onChange={(showTrajectories) => onUpdateDisplaySetting({ showTrajectories })}
        />
        <CheckboxInput
          label="Show velocity vectors"
          checked={display.showVelocityVectors}
          onChange={(showVelocityVectors) => onUpdateDisplaySetting({ showVelocityVectors })}
        />
        <CheckboxInput
          label="Show force vectors"
          checked={display.showForceVectors}
          onChange={(showForceVectors) => onUpdateDisplaySetting({ showForceVectors })}
        />
      </section>
    </div>
  );
}
