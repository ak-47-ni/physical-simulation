export type LengthUnit = "m" | "cm";

export type UnitViewport = {
  lengthUnit: LengthUnit;
  pixelsPerMeter: number;
};

export type Point2 = {
  x: number;
  y: number;
};

const METERS_PER_LENGTH_UNIT: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
};

function authoringLengthToMeters(value: number, unit: LengthUnit): number {
  return value * METERS_PER_LENGTH_UNIT[unit];
}

function metersToAuthoringLength(value: number, unit: LengthUnit): number {
  return value / METERS_PER_LENGTH_UNIT[unit];
}

function roundScreenPixelValue(value: number): number {
  return Number(value.toFixed(3));
}

export function authoringLengthToScreenPixels(
  value: number,
  viewport: UnitViewport,
): number {
  return siLengthToScreenPixels(
    authoringLengthToMeters(value, viewport.lengthUnit),
    viewport,
  );
}

export function screenPixelsToAuthoringLength(
  value: number,
  viewport: UnitViewport,
): number {
  return metersToAuthoringLength(value / viewport.pixelsPerMeter, viewport.lengthUnit);
}

export function siLengthToScreenPixels(value: number, viewport: UnitViewport): number {
  return roundScreenPixelValue(value * viewport.pixelsPerMeter);
}

export function projectAuthoringPointToScreen(
  point: Point2,
  viewport: UnitViewport,
): Point2 {
  return {
    x: authoringLengthToScreenPixels(point.x, viewport),
    y: authoringLengthToScreenPixels(point.y, viewport),
  };
}

export function projectScreenPointToAuthoring(
  point: Point2,
  viewport: UnitViewport,
): Point2 {
  return {
    x: screenPixelsToAuthoringLength(point.x, viewport),
    y: screenPixelsToAuthoringLength(point.y, viewport),
  };
}

export function projectSiPointToScreen(point: Point2, viewport: UnitViewport): Point2 {
  return {
    x: siLengthToScreenPixels(point.x, viewport),
    y: siLengthToScreenPixels(point.y, viewport),
  };
}
