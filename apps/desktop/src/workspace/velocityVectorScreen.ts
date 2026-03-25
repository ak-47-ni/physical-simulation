export type ScreenVelocityVector = {
  dx: number;
  dy: number;
};

const MIN_VECTOR_LENGTH_PX = 18;
const MAX_VECTOR_LENGTH_PX = 84;
const VECTOR_SCALE = 3;
const ZERO_EPSILON = 1e-9;

function normalizeZero(value: number): number {
  return Math.abs(value) < ZERO_EPSILON ? 0 : value;
}

export function mapCartesianVelocityToScreenVector(input: {
  velocityX: number;
  velocityY: number;
}): ScreenVelocityVector | null {
  const speed = Math.hypot(input.velocityX, input.velocityY);

  if (speed === 0) {
    return null;
  }

  const length = Math.max(MIN_VECTOR_LENGTH_PX, Math.min(MAX_VECTOR_LENGTH_PX, speed * VECTOR_SCALE));

  return {
    dx: normalizeZero((input.velocityX / speed) * length),
    dy: normalizeZero((-input.velocityY / speed) * length),
  };
}
