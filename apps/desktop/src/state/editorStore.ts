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

const DUPLICATE_OFFSET = 24;

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

function isLibraryBodyKind(value: string): value is LibraryBodyKind {
  return value in BODY_LABELS;
}

function inferBodyKind(entityId: string): LibraryBodyKind | null {
  const [kind] = entityId.split("-");
  return isLibraryBodyKind(kind) ? kind : null;
}

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

export function createDuplicatedEntity(
  entities: EditorSceneEntity[],
  entity: EditorSceneEntity,
): EditorSceneEntity {
  const duplicatedPosition = {
    x: entity.x + DUPLICATE_OFFSET,
    y: entity.y + DUPLICATE_OFFSET,
  };
  const kind = inferBodyKind(entity.id);

  if (kind) {
    return createPlacedBodyEntity(entities, kind, duplicatedPosition);
  }

  const nextIndex =
    entities.filter((candidate) => candidate.id.startsWith(`${entity.id}-copy-`)).length + 1;

  return {
    id: `${entity.id}-copy-${nextIndex}`,
    label: `${entity.label} Copy ${nextIndex}`,
    x: duplicatedPosition.x,
    y: duplicatedPosition.y,
  };
}
