import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { BoardArcEndpointKey } from "./boardArcPlacement";
import { getBoardArcEndpoint } from "./boardArcPlacement";
import type { EditorSceneEntity } from "./editorStore";

export type BoardAnchoredArcTrackConstraintDraft = {
  center: Vector2;
  endAngleDegrees: number;
  entryEndpoint: "start" | "end";
  id: string;
  kind: "arc-track";
  radius: number;
  side: "inside" | "outside";
  startAngleDegrees: number;
};

type CreateBoardAnchoredArcTrackConstraintInput = {
  board: Extract<EditorSceneEntity, { kind: "board" }>;
  center: Vector2;
  endpointKey: BoardArcEndpointKey;
  id: string;
  side?: BoardAnchoredArcTrackConstraintDraft["side"];
};

function roundArcValue(value: number): number {
  return Number(value.toFixed(6));
}

function getCartesianAngleDegrees(from: Vector2, to: Vector2): number {
  return roundArcValue((Math.atan2(from.y - to.y, to.x - from.x) * 180) / Math.PI);
}

function getIncreasingArcTangent(angleDegrees: number): Vector2 {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: -Math.sin(angleRadians),
    y: Math.cos(angleRadians),
  };
}

function toCartesian(vector: Vector2): Vector2 {
  return {
    x: vector.x,
    y: -vector.y,
  };
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function createBoardAnchoredArcTrackConstraint(
  input: CreateBoardAnchoredArcTrackConstraintInput,
): BoardAnchoredArcTrackConstraintDraft {
  const endpoint = getBoardArcEndpoint(input.board, input.endpointKey);
  const entryAngleDegrees = getCartesianAngleDegrees(input.center, endpoint.point);
  const radius = roundArcValue(
    Math.hypot(endpoint.point.x - input.center.x, endpoint.point.y - input.center.y),
  );
  const increasingArcTangent = getIncreasingArcTangent(entryAngleDegrees);
  const boardTravelTangent = toCartesian(endpoint.tangent);
  const entryEndpoint =
    dot(increasingArcTangent, boardTravelTangent) >= 0 ? "start" : "end";

  return {
    center: { ...input.center },
    endAngleDegrees:
      entryEndpoint === "start"
        ? roundArcValue(entryAngleDegrees + 180)
        : roundArcValue(entryAngleDegrees),
    entryEndpoint,
    id: input.id,
    kind: "arc-track",
    radius,
    side: input.side ?? "inside",
    startAngleDegrees:
      entryEndpoint === "start"
        ? roundArcValue(entryAngleDegrees)
        : roundArcValue(entryAngleDegrees - 180),
  };
}
