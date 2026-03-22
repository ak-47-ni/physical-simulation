import type { EditorTool } from "../workspace/tools";

export type LibraryBodyKind = "ball" | "block" | "board" | "polygon";

export type EditorSceneEntity = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type EditorState = {
  activeTool: EditorTool;
  gridVisible: boolean;
  selectedEntityId: string | null;
};

export function createInitialEditorState(): EditorState {
  return {
    activeTool: "select",
    gridVisible: true,
    selectedEntityId: null,
  };
}

export function createInitialSceneEntities(): EditorSceneEntity[] {
  return [
    { id: "ball-1", label: "Ball 1", x: 132, y: 176 },
    { id: "board-1", label: "Board 1", x: 318, y: 272 },
  ];
}

const BODY_LABELS: Record<LibraryBodyKind, string> = {
  ball: "Ball",
  block: "Block",
  board: "Board",
  polygon: "Polygon",
};

export function createPlacedBodyEntity(
  entities: EditorSceneEntity[],
  kind: LibraryBodyKind,
  position: { x: number; y: number },
): EditorSceneEntity {
  const nextIndex =
    entities.filter((entity) => entity.id.startsWith(`${kind}-`)).length + 1;

  return {
    id: `${kind}-${nextIndex}`,
    label: `${BODY_LABELS[kind]} ${nextIndex}`,
    x: position.x,
    y: position.y,
  };
}
