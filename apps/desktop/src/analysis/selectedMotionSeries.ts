import type { RuntimeFrameView } from "../state/runtimeBridge";

export type SelectedMotionFrame = {
  frame: RuntimeFrameView | null;
  timeSeconds: number;
};

export type SelectedMotionSample = {
  displacement: { x: number; y: number };
  frameNumber: number;
  position: { x: number; y: number };
  speed: number;
  timeSeconds: number;
  velocity: { x: number; y: number };
};

function roundSampleValue(value: number): number {
  return Number(value.toFixed(6));
}

export function createSelectedMotionSamples(
  frames: readonly SelectedMotionFrame[],
  entityId: string,
): SelectedMotionSample[] {
  const samples: SelectedMotionSample[] = [];
  let baseline: { x: number; y: number } | null = null;

  for (const frameSample of frames) {
    const frame = frameSample.frame;
    const entity = frame?.entities.find((candidate) => candidate.id === entityId);

    if (!entity) {
      continue;
    }

    const position = {
      x: roundSampleValue(entity.transform.x),
      y: roundSampleValue(entity.transform.y),
    };

    baseline ??= position;

    const velocity = {
      x: roundSampleValue(entity.velocity?.x ?? 0),
      y: roundSampleValue(entity.velocity?.y ?? 0),
    };

    samples.push({
      displacement: {
        x: roundSampleValue(position.x - baseline.x),
        y: roundSampleValue(position.y - baseline.y),
      },
      frameNumber: frame?.frameNumber ?? 0,
      position,
      speed: Math.hypot(velocity.x, velocity.y),
      timeSeconds: roundSampleValue(frameSample.timeSeconds),
      velocity,
    });
  }

  return samples;
}
