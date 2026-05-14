import type { LengthUnit } from "./sceneUnits";

const STORAGE_PRECISION_DECIMALS_IN_METERS = 2;

type Position = {
  x: number;
  y: number;
};

export function quantizeSceneLengthForStorage(
  value: number,
  lengthUnit: LengthUnit,
  precisionDecimalsInMeters = STORAGE_PRECISION_DECIMALS_IN_METERS,
): number {
  const meters = lengthUnit === "m" ? value : value / 100;
  const quantizedMeters = Number(meters.toFixed(precisionDecimalsInMeters));

  return Number((lengthUnit === "m" ? quantizedMeters : quantizedMeters * 100).toFixed(6));
}

export function quantizePositionForStorage(
  position: Position,
  lengthUnit: LengthUnit,
  precisionDecimalsInMeters = STORAGE_PRECISION_DECIMALS_IN_METERS,
): Position {
  return {
    x: quantizeSceneLengthForStorage(position.x, lengthUnit, precisionDecimalsInMeters),
    y: quantizeSceneLengthForStorage(position.y, lengthUnit, precisionDecimalsInMeters),
  };
}

export function isPositionInFirstQuadrant(position: Position): boolean {
  return position.x >= 0 && position.y >= 0;
}

export function clampPositionToFirstQuadrant(position: Position): Position {
  return {
    x: Math.max(0, position.x),
    y: Math.max(0, position.y),
  };
}

export function normalizeAuthoredPositionForCommit(
  position: Position,
  lengthUnit: LengthUnit,
  precisionDecimalsInMeters = STORAGE_PRECISION_DECIMALS_IN_METERS,
): Position {
  return clampPositionToFirstQuadrant(
    quantizePositionForStorage(position, lengthUnit, precisionDecimalsInMeters),
  );
}
