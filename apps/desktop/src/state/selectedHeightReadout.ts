import type { Vector2 } from "../../../../packages/scene-schema/src";

import { getBoardGuideSurface } from "./boardArcPlacement";
import type { EditorSceneEntity } from "./editorStore";
import type { RuntimeFrameView } from "./runtimeBridge";
import { denormalizeLengthFromSi, type LengthUnit } from "./sceneUnits";

type BoardEntity = Extract<EditorSceneEntity, { kind: "board" }>;
type BallEntity = Extract<EditorSceneEntity, { kind: "ball" }>;

type BoardSupportMatch = {
  boardId: string;
  error: number;
  point: Vector2;
};

export type SelectedBallHeightReadout = {
  centerDrop: number;
  currentCenter: Vector2;
  currentSurfacePoint: Vector2;
  offsetGap: number;
  selectedEntityId: string;
  startCenter: Vector2;
  startSurfacePoint: Vector2;
  surfaceDrop: number;
};

const SURFACE_MATCH_EPSILON = 1e-6;

function roundHeightValue(value: number): number {
  return Number(value.toFixed(6));
}

function add(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function scale(vector: Vector2, scalar: number): Vector2 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getBallCenter(ball: BallEntity): Vector2 {
  return {
    x: ball.x + ball.radius,
    y: ball.y + ball.radius,
  };
}

function normalize(vector: Vector2): Vector2 {
  const vectorLength = Math.hypot(vector.x, vector.y);

  if (vectorLength <= SURFACE_MATCH_EPSILON) {
    return { x: 0, y: 0 };
  }

  return scale(vector, 1 / vectorLength);
}

function findBoardSupportPoint(
  ballCenter: Vector2,
  radius: number,
  boards: BoardEntity[],
): BoardSupportMatch | null {
  const tolerance = Math.max(0.06, radius * 0.4);
  let closest: BoardSupportMatch | null = null;

  for (const board of boards) {
    const surface = getBoardGuideSurface(board);
    const start = surface.start.point;
    const end = surface.end.point;
    const segment = subtract(end, start);
    const segmentLengthSquared = Math.max(dot(segment, segment), SURFACE_MATCH_EPSILON);
    const projection = clamp(dot(subtract(ballCenter, start), segment) / segmentLengthSquared, 0, 1);
    const point = add(start, scale(segment, projection));
    const normal = normalize(surface.normal);
    const signedDistance = dot(subtract(ballCenter, point), normal);

    if (signedDistance < 0) {
      continue;
    }

    const error = Math.abs(signedDistance - radius);

    if (error > tolerance) {
      continue;
    }

    const match = {
      boardId: board.id,
      error,
      point: {
        x: roundHeightValue(point.x),
        y: roundHeightValue(point.y),
      },
    };

    if (
      !closest ||
      match.error < closest.error ||
      (Math.abs(match.error - closest.error) <= SURFACE_MATCH_EPSILON &&
        match.boardId.localeCompare(closest.boardId) < 0)
    ) {
      closest = match;
    }
  }

  return closest;
}

export function createSelectedBallHeightReadout(input: {
  entities: EditorSceneEntity[];
  lengthUnit: LengthUnit;
  runtimeFrame: RuntimeFrameView | null;
  selectedEntity: EditorSceneEntity | null;
}): SelectedBallHeightReadout | null {
  const selectedBall =
    input.selectedEntity && input.selectedEntity.kind === "ball" ? input.selectedEntity : null;

  if (!selectedBall || !input.runtimeFrame) {
    return null;
  }

  const runtimeEntity = input.runtimeFrame.entities.find((entity) => entity.id === selectedBall.id);

  if (!runtimeEntity) {
    return null;
  }

  const boards = input.entities.filter(
    (entity): entity is BoardEntity => entity.kind === "board",
  );
  const startCenter = getBallCenter(selectedBall);
  const currentCenter = {
    x: roundHeightValue(denormalizeLengthFromSi(runtimeEntity.transform.x, input.lengthUnit)),
    y: roundHeightValue(denormalizeLengthFromSi(runtimeEntity.transform.y, input.lengthUnit)),
  };
  const startSupport = findBoardSupportPoint(startCenter, selectedBall.radius, boards);
  const currentSupport = findBoardSupportPoint(currentCenter, selectedBall.radius, boards);

  if (!startSupport || !currentSupport) {
    return null;
  }

  const surfaceDrop = roundHeightValue(currentSupport.point.y - startSupport.point.y);
  const centerDrop = roundHeightValue(currentCenter.y - startCenter.y);

  return {
    centerDrop,
    currentCenter,
    currentSurfacePoint: currentSupport.point,
    offsetGap: roundHeightValue(surfaceDrop - centerDrop),
    selectedEntityId: selectedBall.id,
    startCenter: {
      x: roundHeightValue(startCenter.x),
      y: roundHeightValue(startCenter.y),
    },
    startSurfacePoint: startSupport.point,
    surfaceDrop,
  };
}
