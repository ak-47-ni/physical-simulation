import type { CSSProperties } from "react";

type MeasurementInputProps = {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
};

const labelTextStyle: CSSProperties = {
  color: "#6a7890",
  fontSize: "12px",
};

const fieldRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: "8px",
  border: "1px solid rgba(108, 128, 173, 0.18)",
  borderRadius: "10px",
  background: "#ffffff",
  padding: "0 10px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#17304f",
  padding: "8px 0",
  fontSize: "14px",
};

const suffixStyle: CSSProperties = {
  color: "#5d6f88",
  fontSize: "13px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

export function MeasurementInput(props: MeasurementInputProps) {
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>{props.label}</span>
      <span
        style={{
          ...fieldRowStyle,
          opacity: props.disabled ? 0.6 : 1,
          background: props.disabled ? "#f7f9fd" : "#ffffff",
        }}
      >
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
        <span style={suffixStyle}>{props.suffix}</span>
      </span>
    </label>
  );
}
