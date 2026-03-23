import type { EditorTool } from "../workspace/tools";

export type LibraryBodyKind = "ball" | "block" | "board" | "polygon";

export type EditorEntityPhysics = {
  mass: number;
  friction: number;
  restitution: number;
  locked: boolean;
  velocityX: number;
  velocityY: number;
};

type BaseEditorSceneEntity = {
  id: string;
  kind: LibraryBodyKind;
  label: string;
  x: number;
  y: number;
} & EditorEntityPhysics;

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
  selectedConstraintId: string | null;
  selectedEntityId: string | null;
};

const DUPLICATE_OFFSET = 24;

export function createInitialEditorState(): EditorState {
  return {
    activeTool: "select",
    gridVisible: true,
    selectedConstraintId: null,
    selectedEntityId: null,
  };
}

export function createInitialSceneEntities(): EditorSceneEntity[] {
  return [
    {
      id: "ball-1",
      kind: "ball",
      label: "Ball 1",
      x: 132,
      y: 176,
      radius: 24,
      ...BODY_PHYSICS_DEFAULTS.ball,
    },
    {
      id: "board-1",
      kind: "board",
      label: "Board 1",
      x: 318,
      y: 272,
      width: 120,
      height: 18,
      ...BODY_PHYSICS_DEFAULTS.board,
    },
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

const BODY_PHYSICS_DEFAULTS: Record<LibraryBodyKind, EditorEntityPhysics> = {
  ball: {
    mass: 1.2,
    friction: 0.14,
    restitution: 0.82,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  },
  block: {
    mass: 2.8,
    friction: 0.36,
    restitution: 0.24,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  },
  board: {
    mass: 5,
    friction: 0.42,
    restitution: 0.18,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  },
  polygon: {
    mass: 2.2,
    friction: 0.28,
    restitution: 0.22,
    locked: false,
    velocityX: 0,
    velocityY: 0,
  },
};

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
    label: `${BODY_LABELS[kind]} ${nextIndex}`,
    x: position.x,
    y: position.y,
    ...BODY_PHYSICS_DEFAULTS[kind],
  };

  switch (kind) {
    case "ball":
      return {
        ...baseEntity,
        kind: "ball",
        radius: BODY_DEFAULTS.ball.radius,
      };
    case "block":
      return {
        ...baseEntity,
        kind: "block",
        width: BODY_DEFAULTS.block.width,
        height: BODY_DEFAULTS.block.height,
      };
    case "board":
      return {
        ...baseEntity,
        kind: "board",
        width: BODY_DEFAULTS.board.width,
        height: BODY_DEFAULTS.board.height,
      };
    case "polygon":
      return {
        ...baseEntity,
        kind: "polygon",
        width: BODY_DEFAULTS.polygon.width,
        height: BODY_DEFAULTS.polygon.height,
      };
  }
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
