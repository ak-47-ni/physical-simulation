import type { LengthUnit } from "./sceneUnits";

const STORAGE_PRECISION_DECIMALS_IN_METERS = 2;

type Position = {
  x: number;
  y: number;
};

export function quantizeSceneLengthForStorage(value: number, lengthUnit: LengthUnit): number {
  const meters = lengthUnit === "m" ? value : value / 100;
  const quantizedMeters = Number(meters.toFixed(STORAGE_PRECISION_DECIMALS_IN_METERS));

  return Number((lengthUnit === "m" ? quantizedMeters : quantizedMeters * 100).toFixed(6));
}

export function quantizePositionForStorage(
  position: Position,
  lengthUnit: LengthUnit,
): Position {
  return {
    x: quantizeSceneLengthForStorage(position.x, lengthUnit),
    y: quantizeSceneLengthForStorage(position.y, lengthUnit),
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
): Position {
  return clampPositionToFirstQuadrant(quantizePositionForStorage(position, lengthUnit));
}
