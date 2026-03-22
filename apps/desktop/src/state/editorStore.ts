import type { EditorTool } from "../workspace/tools";

export type LibraryBodyKind = "ball" | "block" | "board" | "polygon";

type BaseEditorSceneEntity = {
  id: string;
  kind: LibraryBodyKind;
  label: string;
  x: number;
  y: number;
};

export type BallSceneEntity = BaseEditorSceneEntity & {
  kind: "ball";
  radius: number;
};

export type SizedSceneEntity = BaseEditorSceneEntity & {
  kind: "block" | "board" | "polygon";
  width: number;
  height: number;
};

export type EditorSceneEntity = BallSceneEntity | SizedSceneEntity;

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
    { id: "ball-1", kind: "ball", label: "Ball 1", x: 132, y: 176, radius: 24 },
    { id: "board-1", kind: "board", label: "Board 1", x: 318, y: 272, width: 120, height: 18 },
  ];
}

const BODY_LABELS: Record<LibraryBodyKind, string> = {
  ball: "Ball",
  block: "Block",
  board: "Board",
  polygon: "Polygon",
};

const BODY_DEFAULTS = {
  ball: { radius: 24 },
  block: { width: 84, height: 52 },
  board: { width: 120, height: 18 },
  polygon: { width: 76, height: 76 },
} as const;

function isLibraryBodyKind(value: string): value is LibraryBodyKind {
  return value in BODY_LABELS;
}

function inferBodyKind(entityId: string): LibraryBodyKind | null {
  const [kind] = entityId.split("-");
  return isLibraryBodyKind(kind) ? kind : null;
}

function getNextEntityIndex(entities: EditorSceneEntity[], kind: LibraryBodyKind): number {
  return entities.filter((entity) => entity.id.startsWith(`${kind}-`)).length + 1;
}

export function createPlacedBodyEntity(
  entities: EditorSceneEntity[],
  kind: LibraryBodyKind,
  position: { x: number; y: number },
): EditorSceneEntity {
  const nextIndex = getNextEntityIndex(entities, kind);
  const baseEntity = {
    id: `${kind}-${nextIndex}`,
    kind,
    label: `${BODY_LABELS[kind]} ${nextIndex}`,
    x: position.x,
    y: position.y,
  } as const;

  if (kind === "ball") {
    return {
      ...baseEntity,
      radius: BODY_DEFAULTS.ball.radius,
    };
  }

  return {
    ...baseEntity,
    width: BODY_DEFAULTS[kind].width,
    height: BODY_DEFAULTS[kind].height,
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
    const nextIndex = getNextEntityIndex(entities, kind);
    const baseEntity = {
      ...entity,
      id: `${kind}-${nextIndex}`,
      label: `${BODY_LABELS[kind]} ${nextIndex}`,
      x: duplicatedPosition.x,
      y: duplicatedPosition.y,
    };

    if (entity.kind === "ball") {
      return {
        ...baseEntity,
        kind: "ball",
        radius: entity.radius,
      };
    }

    return {
      ...baseEntity,
      kind: entity.kind,
      width: entity.width,
      height: entity.height,
    };
  }

  const nextIndex =
    entities.filter((candidate) => candidate.id.startsWith(`${entity.id}-copy-`)).length + 1;

  if (entity.kind === "ball") {
    return {
      ...entity,
      id: `${entity.id}-copy-${nextIndex}`,
      label: `${entity.label} Copy ${nextIndex}`,
      x: duplicatedPosition.x,
      y: duplicatedPosition.y,
      radius: entity.radius,
    };
  }

  return {
    ...entity,
    id: `${entity.id}-copy-${nextIndex}`,
    label: `${entity.label} Copy ${nextIndex}`,
    x: duplicatedPosition.x,
    y: duplicatedPosition.y,
    width: entity.width,
    height: entity.height,
  };
}
