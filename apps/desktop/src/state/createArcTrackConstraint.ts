import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { EditorArcTrackConstraint } from "./editorConstraints";
import type { EditorSceneEntity } from "./editorStore";

export type ArcTrackConstraintDraft = Omit<EditorArcTrackConstraint, "label">;

type CreateArcTrackConstraintInput = {
  ball: Extract<EditorSceneEntity, { kind: "ball" }>;
  center: Vector2;
  id: string;
  side?: ArcTrackConstraintDraft["side"];
};

function roundArcValue(value: number): number {
  return Number(value.toFixed(6));
}

function getBallCenter(ball: Extract<EditorSceneEntity, { kind: "ball" }>): Vector2 {
  return {
    x: ball.x + ball.radius,
    y: ball.y + ball.radius,
  };
}

function getCartesianAngleDegrees(from: Vector2, to: Vector2): number {
  return roundArcValue(
    (Math.atan2(from.y - to.y, to.x - from.x) * 180) / Math.PI,
  );
}

export function createArcTrackConstraintFromBallAndCenter(
  input: CreateArcTrackConstraintInput,
): ArcTrackConstraintDraft {
  const ballCenter = getBallCenter(input.ball);
  const dx = ballCenter.x - input.center.x;
  const dy = ballCenter.y - input.center.y;
  const currentBallAngleDegrees = getCartesianAngleDegrees(input.center, ballCenter);

  return {
    center: { ...input.center },
    endAngleDegrees: roundArcValue(currentBallAngleDegrees + 90),
    entityId: input.ball.id,
    id: input.id,
    kind: "arc-track",
    radius: roundArcValue(Math.hypot(dx, dy)),
    side: input.side ?? "inside",
    startAngleDegrees: roundArcValue(currentBallAngleDegrees - 90),
  };
}
