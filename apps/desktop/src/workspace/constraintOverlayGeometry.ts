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
