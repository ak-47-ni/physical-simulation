import type { CSSProperties } from "react";

type TransportSpeedSelectProps = {
  compact?: boolean;
  presets: readonly number[];
  timeScale: number;
  onChange: (timeScale: number) => void;
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
};

const labelStyle: CSSProperties = {
  color: "#17304f",
  fontSize: "12px",
  fontWeight: 600,
};

const selectStyle: CSSProperties = {
  border: "1px solid rgba(17, 37, 64, 0.12)",
  borderRadius: "10px",
  background: "#ffffff",
  color: "#112540",
  padding: "8px 10px",
  fontSize: "13px",
  minWidth: "104px",
};

function formatTimeScaleLabel(timeScale: number): string {
  return `${timeScale}x`;
}

export function TransportSpeedSelect(props: TransportSpeedSelectProps) {
  const { compact = false, onChange, presets, timeScale } = props;
  const options = presets.includes(timeScale) ? presets : [...presets, timeScale].sort((a, b) => a - b);

  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>Speed</span>
      <select
        aria-label="Speed"
        data-testid="transport-speed-select"
        style={{
          ...selectStyle,
          minWidth: compact ? "92px" : selectStyle.minWidth,
          padding: compact ? "7px 9px" : selectStyle.padding,
          fontSize: compact ? "12px" : selectStyle.fontSize,
        }}
        value={String(timeScale)}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);

          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
      >
        {options.map((preset) => (
          <option key={preset} value={preset}>
            {formatTimeScaleLabel(preset)}
          </option>
        ))}
      </select>
    </label>
  );
}
