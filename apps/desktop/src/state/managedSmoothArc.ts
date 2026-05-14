import type { Vector2 } from "../../../../packages/scene-schema/src";

import {
  getBoardArcEndpoints,
  type BoardArcEndpointKey,
} from "./boardArcPlacement";
import type { EditorSceneEntity } from "./editorStore";

type BoardEntity = Extract<EditorSceneEntity, { kind: "board" }>;
type ArcTrackEntity = Extract<EditorSceneEntity, { kind: "arc-track" }>;

type SmoothArcEndpointTarget = {
  board: BoardEntity;
  endpoint: BoardArcEndpointKey;
  point: Vector2;
  tangent: Vector2;
};

type SmoothArcMatch = {
  distance: number;
  source: SmoothArcEndpointTarget;
  target: SmoothArcEndpointTarget;
};

export const MANAGED_SMOOTH_ARC_DISTANCE_METERS = 0.04;

const MIN_TURN_ANGLE_DEGREES = 3;
const MAX_TURN_ANGLE_DEGREES = 170;
const DEFAULT_SMOOTH_ARC_THICKNESS = 0.18;
const DEFAULT_TANGENT_INSET_METERS = 0.22;
const MIN_TANGENT_INSET_METERS = 0.08;
const GEOMETRY_EPSILON = 1e-9;

function add(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector: Vector2, scalar: number): Vector2 {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function length(vector: Vector2): number {
  return Math.hypot(vector.x, vector.y);
}

function distance(a: Vector2, b: Vector2): number {
  return length(subtract(a, b));
}

function normalize(vector: Vector2): Vector2 {
  const vectorLength = length(vector);

  if (vectorLength <= GEOMETRY_EPSILON) {
    return { x: 0, y: 0 };
  }

  return scale(vector, 1 / vectorLength);
}

function perp(vector: Vector2): Vector2 {
  return { x: -vector.y, y: vector.x };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundArcValue(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeSignedAngleDegrees(angleDegrees: number): number {
  const normalized = ((angleDegrees + 180) % 360 + 360) % 360 - 180;

  return roundArcValue(normalized === -180 ? 180 : normalized);
}

function normalizePositiveAngleDegrees(angleDegrees: number): number {
  const normalized = angleDegrees % 360;

  return roundArcValue(normalized < 0 ? normalized + 360 : normalized);
}

function angleForPoint(center: Vector2, point: Vector2): number {
  return normalizeSignedAngleDegrees(
    (Math.atan2(center.y - point.y, point.x - center.x) * 180) / Math.PI,
  );
}

function endpointTargetsForBoard(board: BoardEntity): SmoothArcEndpointTarget[] {
  const endpoints = getBoardArcEndpoints(board);

  return [
    {
      board,
      endpoint: "start",
      point: endpoints.start.point,
      tangent: normalize(endpoints.start.tangent),
    },
    {
      board,
      endpoint: "end",
      point: endpoints.end.point,
      tangent: normalize(endpoints.end.tangent),
    },
  ];
}

function connectionKey(source: SmoothArcEndpointTarget, target: SmoothArcEndpointTarget): string {
  return `${source.board.id}-${source.endpoint}-${target.board.id}-${target.endpoint}`;
}

function sortSmoothArcMatches(a: SmoothArcMatch, b: SmoothArcMatch): number {
  if (Math.abs(a.distance - b.distance) > GEOMETRY_EPSILON) {
    return a.distance - b.distance;
  }

  return connectionKey(a.source, a.target).localeCompare(connectionKey(b.source, b.target));
}

export function createManagedSmoothArcId(input: {
  sourceEndpoint: BoardArcEndpointKey;
  sourceEntityId: string;
  targetEndpoint: BoardArcEndpointKey;
  targetEntityId: string;
}): string {
  return `smooth-arc-${input.sourceEntityId}-${input.sourceEndpoint}-${input.targetEntityId}-${input.targetEndpoint}`;
}

function lineIntersection(
  originA: Vector2,
  directionA: Vector2,
  originB: Vector2,
  directionB: Vector2,
): { a: number; b: number; point: Vector2 } | null {
  const denominator = cross(directionA, directionB);

  if (Math.abs(denominator) <= GEOMETRY_EPSILON) {
    return null;
  }

  const offset = subtract(originB, originA);
  const a = cross(offset, directionB) / denominator;
  const b = cross(offset, directionA) / denominator;

  return {
    a,
    b,
    point: add(originA, scale(directionA, a)),
  };
}

function createSmoothArcGeometry(match: SmoothArcMatch): {
  center: Vector2;
  entryEndpoint: "start" | "end";
  radius: number;
  rotationDegrees: number;
  sweepAngleDegrees: number;
} | null {
  const sourceTangent = normalize(match.source.tangent);
  const targetTangent = normalize(match.target.tangent);
  const travelExitTangent = scale(targetTangent, -1);
  const turnSign = Math.sign(cross(sourceTangent, travelExitTangent));
  const turnAngleRadians = Math.acos(
    clamp(dot(sourceTangent, travelExitTangent), -1, 1),
  );
  const turnAngleDegrees = (turnAngleRadians * 180) / Math.PI;

  if (
    turnSign === 0 ||
    turnAngleDegrees < MIN_TURN_ANGLE_DEGREES ||
    turnAngleDegrees > MAX_TURN_ANGLE_DEGREES
  ) {
    return null;
  }

  const intersection = lineIntersection(
    match.source.point,
    sourceTangent,
    match.target.point,
    travelExitTangent,
  );

  if (!intersection) {
    return null;
  }

  const maxInset = Math.min(match.source.board.width, match.target.board.width) * 0.28;
  const tangentInset = clamp(
    DEFAULT_TANGENT_INSET_METERS,
    MIN_TANGENT_INSET_METERS,
    maxInset,
  );
  const radius = tangentInset / Math.tan(turnAngleRadians / 2);

  if (!Number.isFinite(radius) || radius <= GEOMETRY_EPSILON) {
    return null;
  }

  const startPoint = subtract(intersection.point, scale(sourceTangent, tangentInset));
  const endPoint = add(intersection.point, scale(travelExitTangent, tangentInset));
  const sourceCenter = add(startPoint, scale(perp(sourceTangent), turnSign * radius));
  const targetCenter = add(endPoint, scale(perp(travelExitTangent), turnSign * radius));
  const center = scale(add(sourceCenter, targetCenter), 0.5);
  const sourceAngleDegrees = angleForPoint(center, startPoint);
  const targetAngleDegrees = angleForPoint(center, endPoint);
  const startAngleDegrees = turnSign > 0 ? targetAngleDegrees : sourceAngleDegrees;
  const endAngleDegrees = turnSign > 0 ? sourceAngleDegrees : targetAngleDegrees;
  const sweepAngleDegrees = normalizePositiveAngleDegrees(
    endAngleDegrees - startAngleDegrees,
  );

  if (
    sweepAngleDegrees < MIN_TURN_ANGLE_DEGREES ||
    sweepAngleDegrees > MAX_TURN_ANGLE_DEGREES
  ) {
    return null;
  }

  return {
    center: {
      x: roundArcValue(center.x),
      y: roundArcValue(center.y),
    },
    entryEndpoint: turnSign > 0 ? "end" : "start",
    radius: roundArcValue(radius),
    rotationDegrees: normalizeSignedAngleDegrees(startAngleDegrees + sweepAngleDegrees / 2),
    sweepAngleDegrees: roundArcValue(sweepAngleDegrees),
  };
}

function createManagedSmoothArcEntity(match: SmoothArcMatch): ArcTrackEntity | null {
  const geometry = createSmoothArcGeometry(match);

  if (!geometry) {
    return null;
  }

  const id = createManagedSmoothArcId({
    sourceEndpoint: match.source.endpoint,
    sourceEntityId: match.source.board.id,
    targetEndpoint: match.target.endpoint,
    targetEntityId: match.target.board.id,
  });

  return {
    autoGenerated: true,
    anchorEndpoint: match.source.endpoint,
    anchorEntityId: match.source.board.id,
    anchorEntityKind: "board",
    center: geometry.center,
    centralAngleDegrees: geometry.sweepAngleDegrees,
    entryEndpoint: geometry.entryEndpoint,
    id,
    kind: "arc-track",
    label: "Smooth Arc",
    managedConnection: {
      sourceEndpoint: match.source.endpoint,
      sourceEntityId: match.source.board.id,
      targetEndpoint: match.target.endpoint,
      targetEntityId: match.target.board.id,
    },
    physicsMode: "hybrid-rail-body",
    radius: geometry.radius,
    rotationDegrees: geometry.rotationDegrees,
    side: "inside",
    sweepAngleDegrees: geometry.sweepAngleDegrees,
    thickness: DEFAULT_SMOOTH_ARC_THICKNESS,
  };
}

function roundBoardPosition(board: BoardEntity): BoardEntity {
  return {
    ...board,
    x: roundArcValue(board.x),
    y: roundArcValue(board.y),
  };
}

export function resolveManagedSmoothArcBoardSnap(input: {
  board: BoardEntity;
  entities: EditorSceneEntity[];
}): BoardEntity | null {
  const otherBoards = input.entities.filter(
    (entity): entity is BoardEntity => entity.kind === "board" && entity.id !== input.board.id,
  );
  const matches: Array<{ distance: number; key: string; snappedBoard: BoardEntity }> = [];

  for (const source of endpointTargetsForBoard(input.board)) {
    for (const otherBoard of otherBoards) {
      for (const target of endpointTargetsForBoard(otherBoard)) {
        const endpointDistance = distance(source.point, target.point);

        if (endpointDistance > MANAGED_SMOOTH_ARC_DISTANCE_METERS) {
          continue;
        }

        const translation = subtract(target.point, source.point);
        const snappedBoard = roundBoardPosition({
          ...input.board,
          x: input.board.x + translation.x,
          y: input.board.y + translation.y,
        });
        const snappedSource = endpointTargetsForBoard(snappedBoard).find(
          (candidate) => candidate.endpoint === source.endpoint,
        );

        if (!snappedSource) {
          continue;
        }

        const snappedEntities = input.entities.map((entity) =>
          entity.id === input.board.id ? snappedBoard : entity,
        );
        const snappedMatch = findClosestSmoothArcMatch({
          entities: snappedEntities,
          requiredEntityId: input.board.id,
        });

        if (!snappedMatch) {
          continue;
        }

        matches.push({
          distance: endpointDistance,
          key: connectionKey(snappedSource, target),
          snappedBoard,
        });
      }
    }
  }

  return matches
    .sort((a, b) => {
      if (Math.abs(a.distance - b.distance) > GEOMETRY_EPSILON) {
        return a.distance - b.distance;
      }

      return a.key.localeCompare(b.key);
    })[0]
    ?.snappedBoard ?? null;
}

function findClosestSmoothArcMatch(input: {
  entities: EditorSceneEntity[];
  requiredEntityId?: string;
}): SmoothArcMatch | null {
  const boards = input.entities.filter(
    (entity): entity is BoardEntity => entity.kind === "board",
  );
  const matches: SmoothArcMatch[] = [];

  for (let boardIndex = 0; boardIndex < boards.length; boardIndex += 1) {
    for (let otherIndex = boardIndex + 1; otherIndex < boards.length; otherIndex += 1) {
      const board = boards[boardIndex];
      const other = boards[otherIndex];

      if (
        input.requiredEntityId &&
        board.id !== input.requiredEntityId &&
        other.id !== input.requiredEntityId
      ) {
        continue;
      }

      for (const source of endpointTargetsForBoard(board)) {
        for (const target of endpointTargetsForBoard(other)) {
          const endpointDistance = distance(source.point, target.point);

          if (endpointDistance > MANAGED_SMOOTH_ARC_DISTANCE_METERS) {
            continue;
          }

          const ordered =
            connectionKey(source, target).localeCompare(connectionKey(target, source)) <= 0
              ? { source, target }
              : { source: target, target: source };

          matches.push({
            ...ordered,
            distance: endpointDistance,
          });
        }
      }
    }
  }

  return matches
    .map((match) => ({
      arc: createManagedSmoothArcEntity(match),
      match,
    }))
    .filter((candidate): candidate is { arc: ArcTrackEntity; match: SmoothArcMatch } =>
      candidate.arc !== null,
    )
    .sort((a, b) => sortSmoothArcMatches(a.match, b.match))[0]?.match ?? null;
}

export function createManagedSmoothArcPreview(input: {
  entities: EditorSceneEntity[];
  requiredEntityId?: string;
}): ArcTrackEntity | null {
  const match = findClosestSmoothArcMatch(input);

  return match ? createManagedSmoothArcEntity(match) : null;
}

function resolveManagedArcReplacement(
  entity: ArcTrackEntity,
  entities: EditorSceneEntity[],
): ArcTrackEntity | null {
  if (!entity.autoGenerated || !entity.managedConnection) {
    return entity;
  }

  const sourceBoard = entities.find(
    (candidate): candidate is BoardEntity =>
      candidate.kind === "board" &&
      candidate.id === entity.managedConnection?.sourceEntityId,
  );
  const targetBoard = entities.find(
    (candidate): candidate is BoardEntity =>
      candidate.kind === "board" &&
      candidate.id === entity.managedConnection?.targetEntityId,
  );

  if (!sourceBoard || !targetBoard) {
    return null;
  }

  const sourceEndpoint = endpointTargetsForBoard(sourceBoard).find(
    (candidate) => candidate.endpoint === entity.managedConnection?.sourceEndpoint,
  );
  const targetEndpoint = endpointTargetsForBoard(targetBoard).find(
    (candidate) => candidate.endpoint === entity.managedConnection?.targetEndpoint,
  );

  if (!sourceEndpoint || !targetEndpoint) {
    return null;
  }

  const endpointDistance = distance(sourceEndpoint.point, targetEndpoint.point);

  if (endpointDistance > MANAGED_SMOOTH_ARC_DISTANCE_METERS) {
    return null;
  }

  return createManagedSmoothArcEntity({
    distance: endpointDistance,
    source: sourceEndpoint,
    target: targetEndpoint,
  });
}

export function reconcileManagedSmoothArcEntities(input: {
  createMissing?: boolean;
  entities: EditorSceneEntity[];
  requiredEntityId?: string;
}): EditorSceneEntity[] {
  const reconciled = input.entities.flatMap((entity) => {
    if (entity.kind !== "arc-track") {
      return [entity];
    }

    const replacement = resolveManagedArcReplacement(entity, input.entities);

    return replacement ? [replacement] : [];
  });

  if (!input.createMissing) {
    return reconciled;
  }

  const preview = createManagedSmoothArcPreview({
    entities: reconciled,
    requiredEntityId: input.requiredEntityId,
  });

  if (!preview || reconciled.some((entity) => entity.id === preview.id)) {
    return reconciled;
  }

  return [...reconciled, preview];
}
