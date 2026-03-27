export type OverlayPoint = {
  x: number;
  y: number;
};

export type ConstraintLineGeometry = {
  angleDegrees: number;
  hitboxThickness: number;
  length: number;
  strokeThickness: number;
};

export type SpringOverlayGeometry = ConstraintLineGeometry & {
  points: OverlayPoint[];
  pointsAttribute: string;
};

export type ArcOverlayGeometry = {
  bounds: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  endPoint: OverlayPoint;
  hitboxThickness: number;
  pathData: string;
  startPoint: OverlayPoint;
  strokeThickness: number;
};

type CreateArcOverlayGeometryInput = {
  center: OverlayPoint;
  endAngleDegrees: number;
  radius: number;
  startAngleDegrees: number;
};

const ARC_HITBOX_THICKNESS = 16;
const ARC_STROKE_THICKNESS = 4;

function roundOverlayValue(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeArcSweepDegrees(startAngleDegrees: number, endAngleDegrees: number): number {
  let sweep = endAngleDegrees - startAngleDegrees;

  while (sweep <= 0) {
    sweep += 360;
  }

  return sweep;
}

function projectArcPoint(
  center: OverlayPoint,
  radius: number,
  angleDegrees: number,
): OverlayPoint {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: roundOverlayValue(center.x + radius * Math.cos(angleRadians)),
    y: roundOverlayValue(center.y - radius * Math.sin(angleRadians)),
  };
}

export function createConstraintLineGeometry(
  start: OverlayPoint,
  end: OverlayPoint,
): ConstraintLineGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return {
    angleDegrees: (Math.atan2(dy, dx) * 180) / Math.PI,
    hitboxThickness: 16,
    length: Math.hypot(dx, dy),
    strokeThickness: 4,
  };
}

export function createSpringOverlayGeometry(
  start: OverlayPoint,
  end: OverlayPoint,
): SpringOverlayGeometry {
  const line = createConstraintLineGeometry(start, end);
  const centerY = line.hitboxThickness / 2;
  const leadSegment = Math.min(12, Math.max(4, line.length / 8));
  const coilAmplitude = Math.min(line.hitboxThickness / 2 - 2, Math.max(3, line.length / 14));
  const coilCount = Math.max(4, Math.round(line.length / 24));
  const points: OverlayPoint[] = [{ x: 0, y: centerY }];

  if (line.length <= leadSegment * 2) {
    points.push({ x: line.length, y: centerY });
  } else {
    const usableLength = line.length - leadSegment * 2;
    const coilStep = usableLength / coilCount;

    points.push({ x: leadSegment, y: centerY });

    for (let index = 0; index < coilCount; index += 1) {
      points.push({
        x: leadSegment + coilStep * (index + 1),
        y: index % 2 === 0 ? centerY - coilAmplitude : centerY + coilAmplitude,
      });
    }

    points.push({ x: line.length - leadSegment, y: centerY });
    points.push({ x: line.length, y: centerY });
  }

  return {
    ...line,
    points,
    pointsAttribute: points.map((point) => `${point.x},${point.y}`).join(" "),
  };
}

export function createArcOverlayGeometry(
  input: CreateArcOverlayGeometryInput,
): ArcOverlayGeometry {
  const sweepDegrees = normalizeArcSweepDegrees(input.startAngleDegrees, input.endAngleDegrees);
  const segmentCount = Math.max(8, Math.ceil(sweepDegrees / 12));
  const padding = ARC_HITBOX_THICKNESS / 2;
  const points: OverlayPoint[] = [];

  for (let index = 0; index <= segmentCount; index += 1) {
    const angleDegrees = input.startAngleDegrees + (sweepDegrees * index) / segmentCount;
    points.push(projectArcPoint(input.center, input.radius, angleDegrees));
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = roundOverlayValue(Math.min(...xs) - padding);
  const top = roundOverlayValue(Math.min(...ys) - padding);
  const width = roundOverlayValue(Math.max(...xs) - Math.min(...xs) + padding * 2);
  const height = roundOverlayValue(Math.max(...ys) - Math.min(...ys) + padding * 2);
  const pathData = points
    .map((point, index) => {
      const x = roundOverlayValue(point.x - left);
      const y = roundOverlayValue(point.y - top);

      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return {
    bounds: {
      height,
      left,
      top,
      width,
    },
    endPoint: points.at(-1) ?? points[0],
    hitboxThickness: ARC_HITBOX_THICKNESS,
    pathData,
    startPoint: points[0],
    strokeThickness: ARC_STROKE_THICKNESS,
  };
}
