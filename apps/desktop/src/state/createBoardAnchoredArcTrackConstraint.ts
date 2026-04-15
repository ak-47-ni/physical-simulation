import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { BoardArcEndpointKey } from "./boardArcPlacement";
import { getBoardArcEndpoint } from "./boardArcPlacement";
import type { EditorSceneEntity } from "./editorStore";

export const ARC_TRACK_SPAN_PRESETS = [90, 180, 270] as const;
export type ArcTrackSpanPresetDegrees = (typeof ARC_TRACK_SPAN_PRESETS)[number];

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
  spanDegrees?: ArcTrackSpanPresetDegrees;
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

function toCanvas(vector: Vector2): Vector2 {
  return {
    x: vector.x,
    y: -vector.y,
  };
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function getBoardAnchoredArcTrackEntryAngleDegrees(
  constraint: BoardAnchoredArcTrackConstraintDraft,
): number {
  return constraint.entryEndpoint === "start"
    ? constraint.startAngleDegrees
    : constraint.endAngleDegrees;
}

export function getBoardAnchoredArcTrackEntryTangent(
  constraint: BoardAnchoredArcTrackConstraintDraft,
): Vector2 {
  const increasingArcTangent = getIncreasingArcTangent(
    getBoardAnchoredArcTrackEntryAngleDegrees(constraint),
  );
  const cartesianEntryTangent =
    constraint.entryEndpoint === "start"
      ? increasingArcTangent
      : {
          x: -increasingArcTangent.x,
          y: -increasingArcTangent.y,
        };

  return toCanvas(cartesianEntryTangent);
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
  const spanDegrees = input.spanDegrees ?? 180;

  return {
    center: { ...input.center },
    endAngleDegrees:
      entryEndpoint === "start"
        ? roundArcValue(entryAngleDegrees + spanDegrees)
        : roundArcValue(entryAngleDegrees),
    entryEndpoint,
    id: input.id,
    kind: "arc-track",
    radius,
    side: input.side ?? "inside",
    startAngleDegrees:
      entryEndpoint === "start"
        ? roundArcValue(entryAngleDegrees)
        : roundArcValue(entryAngleDegrees - spanDegrees),
  };
}
