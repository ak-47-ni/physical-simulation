import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { EditorSceneEntity } from "./editorStore";

type BoardArcAnchorEntity = Extract<EditorSceneEntity, { kind: "block" | "board" }>;

export type BoardArcEndpointKey = "start" | "end";

export type BoardArcEndpoint = {
  key: BoardArcEndpointKey;
  point: Vector2;
  tangent: Vector2;
};

export type BoardArcSnapTarget = {
  boardDistance: number;
  boardId: string;
  endpoint: BoardArcEndpoint;
  endpointDistance: number;
};

type BoardArcEndpointMap = {
  end: BoardArcEndpoint;
  start: BoardArcEndpoint;
};

function getBoardCenter(board: BoardArcAnchorEntity): Vector2 {
  return {
    x: board.x + board.width / 2,
    y: board.y + board.height / 2,
  };
}

function getBoardAxisX(board: BoardArcAnchorEntity): Vector2 {
  const rotationRadians = ((board.rotationDegrees ?? 0) * Math.PI) / 180;

  return {
    x: Math.cos(rotationRadians),
    y: Math.sin(rotationRadians),
  };
}

function getBoardAxisY(board: BoardArcAnchorEntity): Vector2 {
  const axisX = getBoardAxisX(board);

  return {
    x: -axisX.y,
    y: axisX.x,
  };
}

function scale(vector: Vector2, scalar: number): Vector2 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
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

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function distanceBetweenPoints(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getBoardDistanceFromPoint(
  board: BoardArcAnchorEntity,
  position: Vector2,
): number {
  const center = getBoardCenter(board);
  const axisX = getBoardAxisX(board);
  const axisY = getBoardAxisY(board);
  const offset = subtract(position, center);
  const localX = dot(offset, axisX);
  const localY = dot(offset, axisY);
  const outsideX = Math.max(Math.abs(localX) - board.width / 2, 0);
  const outsideY = Math.max(Math.abs(localY) - board.height / 2, 0);

  return Math.hypot(outsideX, outsideY);
}

export function getBoardArcEndpoints(
  board: BoardArcAnchorEntity,
): BoardArcEndpointMap {
  const center = getBoardCenter(board);
  const axisX = getBoardAxisX(board);
  const topEdgeMidpoint = add(center, scale(getBoardAxisY(board), -board.height / 2));
  const halfWidthOffset = scale(axisX, board.width / 2);

  return {
    start: {
      key: "start",
      point: add(topEdgeMidpoint, scale(halfWidthOffset, -1)),
      tangent: scale(axisX, -1),
    },
    end: {
      key: "end",
      point: add(topEdgeMidpoint, halfWidthOffset),
      tangent: axisX,
    },
  };
}

export function getBoardArcEndpoint(
  board: BoardArcAnchorEntity,
  key: BoardArcEndpointKey,
): BoardArcEndpoint {
  return getBoardArcEndpoints(board)[key];
}

export function resolveBoardArcSnapTarget(input: {
  boards: BoardArcAnchorEntity[];
  maxSnapDistance: number;
  position: Vector2;
}): BoardArcSnapTarget | null {
  let closestTarget: BoardArcSnapTarget | null = null;

  for (const board of input.boards) {
    const boardDistance = getBoardDistanceFromPoint(board, input.position);

    if (boardDistance > input.maxSnapDistance) {
      continue;
    }

    const endpoints = getBoardArcEndpoints(board);
    const startDistance = distanceBetweenPoints(input.position, endpoints.start.point);
    const endDistance = distanceBetweenPoints(input.position, endpoints.end.point);
    const endpoint = startDistance <= endDistance ? endpoints.start : endpoints.end;
    const endpointDistance = Math.min(startDistance, endDistance);

    if (
      !closestTarget ||
      boardDistance < closestTarget.boardDistance ||
      (boardDistance === closestTarget.boardDistance &&
        endpointDistance < closestTarget.endpointDistance) ||
      (boardDistance === closestTarget.boardDistance &&
        endpointDistance === closestTarget.endpointDistance &&
        board.id.localeCompare(closestTarget.boardId) < 0) ||
      (boardDistance === closestTarget.boardDistance &&
        endpointDistance === closestTarget.endpointDistance &&
        board.id === closestTarget.boardId &&
        endpoint.key.localeCompare(closestTarget.endpoint.key) < 0)
    ) {
      closestTarget = {
        boardDistance,
        boardId: board.id,
        endpoint,
        endpointDistance,
      };
    }
  }

  return closestTarget;
}
