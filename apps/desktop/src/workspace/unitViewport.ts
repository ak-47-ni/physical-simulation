export type LengthUnit = "m" | "cm";

export type UnitViewport = {
  lengthUnit: LengthUnit;
  offsetPx?: Point2;
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

export const DEFAULT_WORKSPACE_VIEWPORT: UnitViewport = {
  lengthUnit: "cm",
  offsetPx: { x: 0, y: 0 },
  pixelsPerMeter: 100,
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

function roundAuthoringValue(value: number): number {
  return Number(value.toFixed(6));
}

export function readViewportOffsetPx(viewport: UnitViewport): Point2 {
  return viewport.offsetPx ?? { x: 0, y: 0 };
}

export function authoringLengthToSiMeters(
  value: number,
  viewport: UnitViewport,
): number {
  return authoringLengthToMeters(value, viewport.lengthUnit);
}

export function siMetersToAuthoringLength(
  value: number,
  viewport: UnitViewport,
): number {
  return roundAuthoringValue(metersToAuthoringLength(value, viewport.lengthUnit));
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
  return siMetersToAuthoringLength(value / viewport.pixelsPerMeter, viewport);
}

export function siLengthToScreenPixels(value: number, viewport: UnitViewport): number {
  return roundScreenPixelValue(value * viewport.pixelsPerMeter);
}

export function projectAuthoringPointToScreen(
  point: Point2,
  viewport: UnitViewport,
): Point2 {
  const offsetPx = readViewportOffsetPx(viewport);

  return {
    x: authoringLengthToScreenPixels(point.x, viewport) + offsetPx.x,
    y: authoringLengthToScreenPixels(point.y, viewport) + offsetPx.y,
  };
}

export function projectAuthoringPointToSi(point: Point2, viewport: UnitViewport): Point2 {
  return {
    x: authoringLengthToSiMeters(point.x, viewport),
    y: authoringLengthToSiMeters(point.y, viewport),
  };
}

export function projectScreenPointToAuthoring(
  point: Point2,
  viewport: UnitViewport,
): Point2 {
  const offsetPx = readViewportOffsetPx(viewport);

  return {
    x: screenPixelsToAuthoringLength(point.x - offsetPx.x, viewport),
    y: screenPixelsToAuthoringLength(point.y - offsetPx.y, viewport),
  };
}

export function projectSiPointToScreen(point: Point2, viewport: UnitViewport): Point2 {
  const offsetPx = readViewportOffsetPx(viewport);

  return {
    x: siLengthToScreenPixels(point.x, viewport) + offsetPx.x,
    y: siLengthToScreenPixels(point.y, viewport) + offsetPx.y,
  };
}
