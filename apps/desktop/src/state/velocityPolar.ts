const ANGLE_EPSILON = 1e-9;
const VALUE_PRECISION = 6;

type CartesianVelocity = {
  velocityX: number;
  velocityY: number;
};

type PolarVelocity = {
  speed: number;
  directionDegrees: number;
};

function roundVelocityValue(value: number): number {
  if (Math.abs(value) < ANGLE_EPSILON) {
    return 0;
  }

  return Number(value.toFixed(VALUE_PRECISION));
}

export function normalizeDirectionDegrees(directionDegrees: number): number {
  const normalized = directionDegrees % 360;

  if (normalized < 0) {
    return normalized + 360;
  }

  return normalized;
}

export function cartesianVelocityToPolar(input: CartesianVelocity): PolarVelocity {
  const speed = roundVelocityValue(Math.hypot(input.velocityX, input.velocityY));

  if (speed === 0) {
    return {
      speed: 0,
      directionDegrees: 0,
    };
  }

  return {
    speed,
    directionDegrees: roundVelocityValue(
      normalizeDirectionDegrees((Math.atan2(input.velocityY, input.velocityX) * 180) / Math.PI),
    ),
  };
}

export function polarVelocityToCartesian(input: PolarVelocity): CartesianVelocity {
  const directionRadians = (normalizeDirectionDegrees(input.directionDegrees) * Math.PI) / 180;

  return {
    velocityX: roundVelocityValue(input.speed * Math.cos(directionRadians)),
    velocityY: roundVelocityValue(input.speed * Math.sin(directionRadians)),
  };
}
