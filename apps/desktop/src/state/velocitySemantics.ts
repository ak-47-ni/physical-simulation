export type CartesianVelocity = {
  velocityX: number;
  velocityY: number;
};

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

// Authoring uses classroom Cartesian semantics (+Y is upward), while the current
// runtime path still uses screen-down semantics (+Y is downward).
export function authoringVelocityToRuntime(input: CartesianVelocity): CartesianVelocity {
  return {
    velocityX: normalizeSignedZero(input.velocityX),
    velocityY: normalizeSignedZero(-input.velocityY),
  };
}

export function runtimeVelocityToAuthoring(input: CartesianVelocity): CartesianVelocity {
  return {
    velocityX: normalizeSignedZero(input.velocityX),
    velocityY: normalizeSignedZero(-input.velocityY),
  };
}
