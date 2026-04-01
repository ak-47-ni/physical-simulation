import type { Vector2 } from "../../../../packages/scene-schema/src";

import type { EditorSceneEntity } from "./editorStore";

export type BoardArcEndpointKey = "start" | "end";

export type BoardArcEndpoint = {
  key: BoardArcEndpointKey;
  point: Vector2;
  tangent: Vector2;
};

type BoardArcEndpointMap = {
  end: BoardArcEndpoint;
  start: BoardArcEndpoint;
};

function getBoardCenter(board: Extract<EditorSceneEntity, { kind: "board" }>): Vector2 {
  return {
    x: board.x + board.width / 2,
    y: board.y + board.height / 2,
  };
}

function getBoardAxisX(board: Extract<EditorSceneEntity, { kind: "board" }>): Vector2 {
  const rotationRadians = ((board.rotationDegrees ?? 0) * Math.PI) / 180;

  return {
    x: Math.cos(rotationRadians),
    y: Math.sin(rotationRadians),
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

export function getBoardArcEndpoints(
  board: Extract<EditorSceneEntity, { kind: "board" }>,
): BoardArcEndpointMap {
  const center = getBoardCenter(board);
  const axisX = getBoardAxisX(board);
  const halfWidthOffset = scale(axisX, board.width / 2);

  return {
    start: {
      key: "start",
      point: add(center, scale(halfWidthOffset, -1)),
      tangent: scale(axisX, -1),
    },
    end: {
      key: "end",
      point: add(center, halfWidthOffset),
      tangent: axisX,
    },
  };
}

export function getBoardArcEndpoint(
  board: Extract<EditorSceneEntity, { kind: "board" }>,
  key: BoardArcEndpointKey,
): BoardArcEndpoint {
  return getBoardArcEndpoints(board)[key];
}
