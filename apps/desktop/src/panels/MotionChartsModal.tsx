import { useState, type CSSProperties, type MouseEvent } from "react";

import type { SelectedMotionSample } from "../analysis/selectedMotionSeries";
import { useI18n } from "../i18n";

type MotionChartsModalProps = {
  entityLabel: string;
  lengthUnitLabel: string;
  samples: readonly SelectedMotionSample[];
  velocityUnitLabel: string;
  onClose: () => void;
};

type ChartSeries = {
  color: string;
  label: string;
  values: Array<{ timeSeconds: number; value: number }>;
};

type ChartRange = {
  max: number;
  min: number;
};

type ChartBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type HoverReadout = {
  timeSeconds: number;
  values: Array<{ color: string; label: string; value: number }>;
  x: number;
  y: number;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  background: "rgba(15, 23, 42, 0.38)",
  zIndex: 20,
};

const dialogStyle: CSSProperties = {
  width: "min(860px, calc(100vw - 48px))",
  maxHeight: "calc(100vh - 48px)",
  overflow: "auto",
  borderRadius: "22px",
  border: "1px solid rgba(108, 128, 173, 0.22)",
  background: "#f8fafc",
  boxShadow: "0 30px 80px rgba(15, 23, 42, 0.28)",
  padding: "20px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "16px",
};

const chartGridStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "14px",
  borderRadius: "16px",
  border: "1px solid rgba(108, 128, 173, 0.16)",
  background: "#ffffff",
};

const closeButtonStyle: CSSProperties = {
  border: "1px solid rgba(108, 128, 173, 0.22)",
  borderRadius: "999px",
  background: "#ffffff",
  color: "#17304f",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 700,
  padding: "9px 13px",
};

function formatValue(value: number): string {
  return value.toFixed(2);
}

function formatTickValue(value: number, unit: string): string {
  return `${formatValue(value)} ${unit}`;
}

function readValueRange(series: ChartSeries[]): ChartRange {
  const values = series.flatMap((item) => item.values.map((point) => point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);

  return {
    max: min === max ? max + 1 : max,
    min: min === max ? min - 1 : min,
  };
}

function createLinearTicks(range: ChartRange, count: number): number[] {
  if (count <= 1) {
    return [range.min];
  }

  const step = (range.max - range.min) / (count - 1);

  return Array.from({ length: count }, (_, index) => Number((range.min + step * index).toFixed(6)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function projectChartX(
  timeSeconds: number,
  timeRange: ChartRange,
  chart: Pick<ChartBounds, "left" | "width">,
): number {
  const timeSpan = Math.max(timeRange.max - timeRange.min, 0.000001);

  return chart.left + ((timeSeconds - timeRange.min) / timeSpan) * chart.width;
}

function projectChartY(
  value: number,
  valueRange: ChartRange,
  chart: Pick<ChartBounds, "height" | "top">,
): number {
  const valueSpan = Math.max(valueRange.max - valueRange.min, 0.000001);

  return chart.top + (1 - (value - valueRange.min) / valueSpan) * chart.height;
}

function createPointString(
  values: ChartSeries["values"],
  timeRange: ChartRange,
  valueRange: ChartRange,
  chart: ChartBounds,
): string {
  return values
    .map((point) => {
      const x = projectChartX(point.timeSeconds, timeRange, chart);
      const y = projectChartY(point.value, valueRange, chart);

      return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
    })
    .join(" ");
}

function interpolateSeriesValue(values: ChartSeries["values"], timeSeconds: number): number {
  if (values.length === 0) {
    return 0;
  }

  const firstPoint = values[0];
  if (timeSeconds <= firstPoint.timeSeconds) {
    return firstPoint.value;
  }

  for (let index = 1; index < values.length; index += 1) {
    const previousPoint = values[index - 1];
    const currentPoint = values[index];

    if (timeSeconds <= currentPoint.timeSeconds) {
      const span = currentPoint.timeSeconds - previousPoint.timeSeconds;

      if (span <= 0) {
        return currentPoint.value;
      }

      const ratio = (timeSeconds - previousPoint.timeSeconds) / span;
      return previousPoint.value + (currentPoint.value - previousPoint.value) * ratio;
    }
  }

  return values.at(-1)?.value ?? 0;
}

function readHoverReadout(
  event: MouseEvent<SVGSVGElement>,
  svgWidth: number,
  timeRange: ChartRange,
  valueRange: ChartRange,
  chart: ChartBounds,
  series: ChartSeries[],
): HoverReadout | null {
  const rect = event.currentTarget.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const pointerX = ((event.clientX - rect.left) / rect.width) * svgWidth;
  const x = clamp(pointerX, chart.left, chart.left + chart.width);
  const timeSpan = Math.max(timeRange.max - timeRange.min, 0.000001);
  const timeSeconds = timeRange.min + ((x - chart.left) / chart.width) * timeSpan;
  const values = series.map((item) => ({
    color: item.color,
    label: item.label,
    value: interpolateSeriesValue(item.values, timeSeconds),
  }));
  const primaryValue = values[0]?.value ?? 0;

  return {
    timeSeconds,
    values,
    x,
    y: projectChartY(primaryValue, valueRange, chart),
  };
}

function MotionChart(props: {
  heading: string;
  sampleCount: number;
  series: ChartSeries[];
  testId: string;
  unit: string;
}) {
  const [hoverReadout, setHoverReadout] = useState<HoverReadout | null>(null);
  const width = 620;
  const height = 184;
  const chart: ChartBounds = {
    height: 122,
    left: 72,
    top: 20,
    width: 520,
  };
  const preparedSeries = props.series;
  const allTimes = preparedSeries.flatMap((series) =>
    series.values.map((point) => point.timeSeconds),
  );
  const timeRange = {
    max: Math.max(...allTimes, 1),
    min: Math.min(...allTimes, 0),
  };
  const valueRange = readValueRange(preparedSeries);
  const timeTicks = createLinearTicks(timeRange, 3);
  const valueTicks = createLinearTicks(valueRange, 5);
  const zeroTimeX = projectChartX(0, timeRange, chart);
  const zeroValueY = projectChartY(0, valueRange, chart);
  const tooltipWidth = 146;
  const tooltipHeight = hoverReadout ? 24 + hoverReadout.values.length * 16 : 56;
  const tooltipX = hoverReadout
    ? clamp(hoverReadout.x + 12, chart.left, chart.left + chart.width - tooltipWidth)
    : chart.left;
  const tooltipY = hoverReadout
    ? clamp(
        hoverReadout.y - tooltipHeight / 2,
        chart.top + 6,
        chart.top + chart.height - tooltipHeight - 6,
      )
    : chart.top;

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <strong style={{ color: "#17304f" }}>{props.heading}</strong>
        <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
          {props.unit}
        </span>
      </div>
      <svg
        aria-hidden="true"
        data-sample-count={props.sampleCount}
        data-testid={props.testId}
        height={height}
        onMouseLeave={() => {
          setHoverReadout(null);
        }}
        onMouseMove={(event) => {
          setHoverReadout(
            readHoverReadout(event, width, timeRange, valueRange, chart, preparedSeries),
          );
        }}
        style={{
          display: "block",
          width: "100%",
          cursor: "crosshair",
          borderRadius: "14px",
          background:
            "linear-gradient(180deg, rgba(239, 246, 255, 0.76), rgba(248, 250, 252, 0.92))",
        }}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {valueTicks.map((tick, index) => {
          const y = projectChartY(tick, valueRange, chart);

          return (
            <g key={`y-${tick}`} data-testid={`${props.testId}-y-tick-group-${index}`}>
              <line
                stroke="rgba(148, 163, 184, 0.28)"
                x1={chart.left}
                x2={chart.left + chart.width}
                y1={y}
                y2={y}
              />
              <text
                data-testid={`${props.testId}-y-tick-${index}`}
                fill="#64748b"
                fontSize="10"
                textAnchor="end"
                x={chart.left - 10}
                y={y + 3}
              >
                {formatTickValue(tick, props.unit)}
              </text>
            </g>
          );
        })}
        {timeTicks.map((tick, index) => {
          const x = projectChartX(tick, timeRange, chart);

          return (
            <g key={`x-${tick}`} data-testid={`${props.testId}-x-tick-group-${index}`}>
              <line
                stroke="#94a3b8"
                x1={x}
                x2={x}
                y1={chart.top + chart.height}
                y2={chart.top + chart.height + 5}
              />
              <text
                data-testid={`${props.testId}-x-tick-${index}`}
                fill="#64748b"
                fontSize="10"
                textAnchor="middle"
                x={x}
                y={chart.top + chart.height + 19}
              >
                {`${formatValue(tick)} s`}
              </text>
            </g>
          );
        })}
        <line
          stroke="#cbd5e1"
          x1={chart.left}
          x2={chart.left + chart.width}
          y1={chart.top + chart.height}
          y2={chart.top + chart.height}
        />
        <line
          stroke="#cbd5e1"
          x1={chart.left}
          x2={chart.left}
          y1={chart.top}
          y2={chart.top + chart.height}
        />
        <line
          data-testid={`${props.testId}-zero-value-axis`}
          stroke="#334155"
          strokeDasharray="5 4"
          strokeOpacity="0.74"
          strokeWidth="1.35"
          x1={chart.left}
          x2={chart.left + chart.width}
          y1={zeroValueY}
          y2={zeroValueY}
        />
        <text
          data-testid={`${props.testId}-zero-value-label`}
          fill="#0f172a"
          fontSize="10"
          fontWeight="800"
          textAnchor="end"
          x={chart.left - 10}
          y={zeroValueY - 5}
        >
          {formatTickValue(0, props.unit)}
        </text>
        <line
          data-testid={`${props.testId}-zero-time-axis`}
          stroke="#334155"
          strokeDasharray="5 4"
          strokeOpacity="0.74"
          strokeWidth="1.35"
          x1={zeroTimeX}
          x2={zeroTimeX}
          y1={chart.top}
          y2={chart.top + chart.height}
        />
        <text
          data-testid={`${props.testId}-zero-time-label`}
          fill="#0f172a"
          fontSize="10"
          fontWeight="800"
          textAnchor="middle"
          x={zeroTimeX}
          y={chart.top + chart.height + 36}
        >
          0.00 s
        </text>
        {preparedSeries.map((series) => (
          <polyline
            key={series.label}
            fill="none"
            points={createPointString(series.values, timeRange, valueRange, chart)}
            stroke={series.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
        {hoverReadout ? (
          <g data-testid={`${props.testId}-hover-readout`}>
            <line
              data-testid={`${props.testId}-hover-time-line`}
              stroke="#0f172a"
              strokeOpacity="0.45"
              strokeWidth="1.25"
              x1={hoverReadout.x}
              x2={hoverReadout.x}
              y1={chart.top}
              y2={chart.top + chart.height}
            />
            {hoverReadout.values.map((item) => (
              <circle
                key={item.label}
                cx={hoverReadout.x}
                cy={projectChartY(item.value, valueRange, chart)}
                fill="#ffffff"
                r="4"
                stroke={item.color}
                strokeWidth="2"
              />
            ))}
            <g transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect
                fill="rgba(15, 23, 42, 0.9)"
                height={tooltipHeight}
                rx="9"
                width={tooltipWidth}
              />
              <text fill="#ffffff" fontSize="11" fontWeight="800" x="10" y="16">
                {`t ${formatValue(hoverReadout.timeSeconds)} s`}
              </text>
              {hoverReadout.values.map((item, index) => (
                <text
                  key={item.label}
                  fill="#e2e8f0"
                  fontSize="11"
                  fontWeight="700"
                  x="10"
                  y={34 + index * 16}
                >
                  {`${item.label} ${formatTickValue(item.value, props.unit)}`}
                </text>
              ))}
            </g>
          </g>
        ) : null}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {preparedSeries.map((series) => (
          <span
            key={series.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#475569",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "16px",
                height: "3px",
                borderRadius: "999px",
                background: series.color,
              }}
            />
            {series.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function MotionChartsModal(props: MotionChartsModalProps) {
  const { t } = useI18n();
  const latestSample = props.samples.at(-1) ?? null;
  const displacementSeries: ChartSeries[] = [
    {
      color: "#1d70d6",
      label: "Δx",
      values: props.samples.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.displacement.x,
      })),
    },
    {
      color: "#d97706",
      label: "Δy",
      values: props.samples.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.displacement.y,
      })),
    },
  ];
  const velocitySeries: ChartSeries[] = [
    {
      color: "#0f766e",
      label: "vx",
      values: props.samples.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.velocity.x,
      })),
    },
    {
      color: "#b91c1c",
      label: "vy",
      values: props.samples.map((sample) => ({
        timeSeconds: sample.timeSeconds,
        value: sample.velocity.y,
      })),
    },
  ];

  return (
    <div style={overlayStyle}>
      <section
        aria-label={t("motionCharts.title")}
        aria-modal="true"
        role="dialog"
        style={dialogStyle}
      >
        <div style={headerStyle}>
          <div style={{ display: "grid", gap: "6px" }}>
            <h2 style={{ margin: 0, color: "#17304f", fontSize: "22px" }}>
              {t("motionCharts.title")}
            </h2>
            <strong style={{ color: "#2457a6", fontSize: "15px" }}>{props.entityLabel}</strong>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {t("motionCharts.samples", { count: props.samples.length })}
            </span>
          </div>
          <button style={closeButtonStyle} type="button" onClick={props.onClose}>
            {t("motionCharts.close")}
          </button>
        </div>

        {latestSample ? (
          <div
            style={{
              display: "grid",
              gap: "6px",
              marginBottom: "14px",
              color: "#475569",
              fontSize: "13px",
            }}
          >
            <span>
              {t("motionCharts.latestDisplacement", {
                unit: props.lengthUnitLabel,
                x: formatValue(latestSample.displacement.x),
                y: formatValue(latestSample.displacement.y),
              })}
            </span>
            <span>
              {t("motionCharts.latestVelocity", {
                unit: props.velocityUnitLabel,
                x: formatValue(latestSample.velocity.x),
                y: formatValue(latestSample.velocity.y),
              })}
            </span>
            <span>
              {t("motionCharts.absolutePosition", {
                unit: props.lengthUnitLabel,
                x: formatValue(latestSample.position.x),
                y: formatValue(latestSample.position.y),
              })}
            </span>
          </div>
        ) : null}

        <div style={chartGridStyle}>
          <MotionChart
            heading={t("motionCharts.displacementTitle")}
            sampleCount={props.samples.length}
            series={displacementSeries}
            testId="motion-chart-displacement"
            unit={props.lengthUnitLabel}
          />
          <MotionChart
            heading={t("motionCharts.velocityTitle")}
            sampleCount={props.samples.length}
            series={velocitySeries}
            testId="motion-chart-velocity"
            unit={props.velocityUnitLabel}
          />
        </div>
      </section>
    </div>
  );
}
