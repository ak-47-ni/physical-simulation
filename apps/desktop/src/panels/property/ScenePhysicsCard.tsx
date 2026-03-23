import type { CSSProperties } from "react";

import { MeasurementInput } from "./MeasurementInput";

type ScenePhysicsCardProps = {
  disabled?: boolean;
  gravity: number;
  gravityUnitLabel: string;
  lengthUnit: string;
  lengthUnitOptions: readonly string[];
  lockReason?: string | null;
  massUnit: string;
  massUnitOptions: readonly string[];
  onGravityChange: (value: number) => void;
  onLengthUnitChange: (unit: string) => void;
  onMassUnitChange: (unit: string) => void;
  onPixelsPerMeterChange: (value: number) => void;
  onVelocityUnitChange: (unit: string) => void;
  pixelsPerMeter: number;
  velocityUnit: string;
  velocityUnitOptions: readonly string[];
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "14px",
  background: "#f7f9fd",
  border: "1px solid rgba(108, 128, 173, 0.14)",
};

const sectionLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const selectLabelStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
};

const selectLabelTextStyle: CSSProperties = {
  color: "#6a7890",
  fontSize: "12px",
};

const selectStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#17304f",
  padding: "8px 10px",
  fontSize: "14px",
};

const lockCopyStyle: CSSProperties = {
  color: "#9a3412",
  fontSize: "13px",
  lineHeight: 1.5,
};

function UnitSelect(props: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label style={selectLabelStyle}>
      <span style={selectLabelTextStyle}>{props.label}</span>
      <select
        aria-label={props.label}
        disabled={props.disabled}
        style={{
          ...selectStyle,
          opacity: props.disabled ? 0.6 : 1,
          background: props.disabled ? "#f7f9fd" : "#ffffff",
        }}
        value={props.value}
        onChange={(event) => {
          if (props.disabled) {
            return;
          }

          props.onChange(event.target.value);
        }}
      >
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScenePhysicsCard(props: ScenePhysicsCardProps) {
  return (
    <section style={cardStyle}>
      <h2 style={sectionLabelStyle}>Scene physics</h2>
      {props.lockReason ? <span style={lockCopyStyle}>{props.lockReason}</span> : null}
      <MeasurementInput
        disabled={props.disabled}
        label="Gravity"
        suffix={props.gravityUnitLabel}
        value={props.gravity}
        onChange={props.onGravityChange}
      />
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <UnitSelect
          disabled={props.disabled}
          label="Length unit"
          options={props.lengthUnitOptions}
          value={props.lengthUnit}
          onChange={props.onLengthUnitChange}
        />
        <UnitSelect
          disabled={props.disabled}
          label="Velocity unit"
          options={props.velocityUnitOptions}
          value={props.velocityUnit}
          onChange={props.onVelocityUnitChange}
        />
        <UnitSelect
          disabled={props.disabled}
          label="Mass unit"
          options={props.massUnitOptions}
          value={props.massUnit}
          onChange={props.onMassUnitChange}
        />
      </div>
      <MeasurementInput
        disabled={props.disabled}
        label="Pixels per meter"
        suffix="px/m"
        value={props.pixelsPerMeter}
        onChange={props.onPixelsPerMeterChange}
      />
    </section>
  );
}
