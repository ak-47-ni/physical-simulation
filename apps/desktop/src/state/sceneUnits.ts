export type LengthUnit = "m" | "cm";
export type VelocityUnit = "m/s" | "cm/s";
export type MassUnit = "kg" | "g";

const LENGTH_TO_METERS: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
};

const VELOCITY_TO_METERS_PER_SECOND: Record<VelocityUnit, number> = {
  "m/s": 1,
  "cm/s": 0.01,
};

const MASS_TO_KILOGRAMS: Record<MassUnit, number> = {
  kg: 1,
  g: 0.001,
};

export function convertLengthValue(
  value: number,
  fromUnit: LengthUnit,
  toUnit: LengthUnit,
): number {
  return (value * LENGTH_TO_METERS[fromUnit]) / LENGTH_TO_METERS[toUnit];
}

export function convertVelocityValue(
  value: number,
  fromUnit: VelocityUnit,
  toUnit: VelocityUnit,
): number {
  return (value * VELOCITY_TO_METERS_PER_SECOND[fromUnit]) / VELOCITY_TO_METERS_PER_SECOND[toUnit];
}

export function convertMassValue(value: number, fromUnit: MassUnit, toUnit: MassUnit): number {
  return (value * MASS_TO_KILOGRAMS[fromUnit]) / MASS_TO_KILOGRAMS[toUnit];
}

export function convertGravityValue(
  value: number,
  fromUnit: LengthUnit,
  toUnit: LengthUnit,
): number {
  return convertLengthValue(value, fromUnit, toUnit);
}

export function normalizeLengthToSi(value: number, unit: LengthUnit): number {
  return value * LENGTH_TO_METERS[unit];
}

export function normalizeVelocityToSi(value: number, unit: VelocityUnit): number {
  return value * VELOCITY_TO_METERS_PER_SECOND[unit];
}

export function normalizeMassToSi(value: number, unit: MassUnit): number {
  return value * MASS_TO_KILOGRAMS[unit];
}

export function normalizeGravityToSi(value: number, unit: LengthUnit): number {
  return normalizeLengthToSi(value, unit);
}

export function denormalizeLengthFromSi(value: number, unit: LengthUnit): number {
  return value / LENGTH_TO_METERS[unit];
}

export function denormalizeVelocityFromSi(value: number, unit: VelocityUnit): number {
  return value / VELOCITY_TO_METERS_PER_SECOND[unit];
}

export function denormalizeMassFromSi(value: number, unit: MassUnit): number {
  return value / MASS_TO_KILOGRAMS[unit];
}

export function denormalizeGravityFromSi(value: number, unit: LengthUnit): number {
  return denormalizeLengthFromSi(value, unit);
}

export function getGravityUnitLabel(lengthUnit: LengthUnit): `${LengthUnit}/s²` {
  return `${lengthUnit}/s²`;
}
