import type { Vector2 } from "./schema";

export type RuntimeEntityFrame = {
  entityId: string;
  position: Vector2;
  rotation: number;
  velocity?: Vector2;
  acceleration?: Vector2;
};

export type RuntimeFramePayload = {
  frameNumber: number;
  entities: RuntimeEntityFrame[];
};

export function createRuntimeFramePayload(input: RuntimeFramePayload): RuntimeFramePayload {
  return {
    frameNumber: input.frameNumber,
    entities: input.entities.map((entity) => ({
      ...entity,
      position: { ...entity.position },
      velocity: entity.velocity ? { ...entity.velocity } : undefined,
      acceleration: entity.acceleration ? { ...entity.acceleration } : undefined,
    })),
  };
}
