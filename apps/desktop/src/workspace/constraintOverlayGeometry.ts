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
    hitboxThickness: 12,
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
  const points = [
    { x: 0, y: centerY },
    { x: line.length, y: centerY },
  ];

  return {
    ...line,
    points,
    pointsAttribute: points.map((point) => `${point.x},${point.y}`).join(" "),
  };
}
