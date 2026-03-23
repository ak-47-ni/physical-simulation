export const SCENE_SCHEMA_VERSION = 1;

export type Vector2 = {
  x: number;
  y: number;
};

export type SceneEntityPhysics = {
  mass?: number;
  friction?: number;
  restitution?: number;
  locked?: boolean;
  velocityX?: number;
  velocityY?: number;
};

type BaseSceneEntity = {
  id: string;
  label?: string;
};

export type UserPolygonEntity = BaseSceneEntity &
  SceneEntityPhysics & {
    kind: "user-polygon";
    points: Vector2[];
  };

export type BallSceneEntity = BaseSceneEntity &
  SceneEntityPhysics & {
    kind: "ball";
    x: number;
    y: number;
    radius: number;
  };

export type SizedSceneEntity = BaseSceneEntity &
  SceneEntityPhysics & {
    kind: "block" | "board" | "polygon";
    x: number;
    y: number;
    width: number;
    height: number;
  };

export type SceneEntity = UserPolygonEntity | BallSceneEntity | SizedSceneEntity;

export type SceneConstraint = {
  id: string;
  kind: string;
};

export type ForceSource = {
  id: string;
  kind: string;
};

export type Analyzer = {
  id: string;
  kind: string;
  entityId?: string;
};

export type TrajectoryAnalyzer = Analyzer & {
  kind: "trajectory";
  entityId: string;
};

export type AnnotationStroke = {
  id: string;
  points: Vector2[];
};

export type SceneDocument = {
  schemaVersion: number;
  entities: SceneEntity[];
  constraints: SceneConstraint[];
  forceSources: ForceSource[];
  analyzers: Analyzer[];
  annotations: AnnotationStroke[];
};

export type DirtyEditScope = "structure" | "physics" | "analysis" | "annotation";

export function createEmptySceneDocument(): SceneDocument {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    entities: [],
    constraints: [],
    forceSources: [],
    analyzers: [],
    annotations: [],
  };
}

export function createUserPolygonEntity(input: {
  id: string;
  points: Vector2[];
  label?: string;
  mass?: number;
  friction?: number;
  restitution?: number;
  locked?: boolean;
  velocityX?: number;
  velocityY?: number;
}): UserPolygonEntity {
  if (!isConvexPolygon(input.points)) {
    throw new Error("User polygon entities must be convex in v1.");
  }

  const { id, points, ...rest } = input;

  return {
    id,
    kind: "user-polygon",
    points: clonePoints(points),
    ...rest,
  };
}

export function requiresRuntimeRebuild(scopes: DirtyEditScope[]): boolean {
  return scopes.includes("structure") || scopes.includes("physics");
}

export function createTrajectoryAnalyzer(input: {
  id: string;
  entityId: string;
}): TrajectoryAnalyzer {
  return {
    id: input.id,
    kind: "trajectory",
    entityId: input.entityId,
  };
}

export function cloneSceneDocument(scene: SceneDocument): SceneDocument {
  return {
    schemaVersion: scene.schemaVersion,
    entities: scene.entities.map(cloneSceneEntity),
    constraints: scene.constraints.map((constraint) => ({
      ...constraint,
    })),
    forceSources: scene.forceSources.map((source) => ({
      ...source,
    })),
    analyzers: scene.analyzers.map((analyzer) => ({
      ...analyzer,
    })),
    annotations: scene.annotations.map((stroke) => ({
      id: stroke.id,
      points: clonePoints(stroke.points),
    })),
  };
}

function cross(o: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function clonePoints(points: Vector2[]): Vector2[] {
  return points.map((point) => ({ ...point }));
}

function cloneSceneEntity(entity: SceneEntity): SceneEntity {
  if (entity.kind === "user-polygon") {
    return {
      ...entity,
      points: clonePoints(entity.points),
    };
  }

  return {
    ...entity,
  };
}

export function isConvexPolygon(points: Vector2[]): boolean {
  if (points.length < 3) {
    return false;
  }

  let sign = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const nextNext = points[(i + 2) % points.length];
    const z = cross(current, next, nextNext);

    if (z === 0) {
      continue;
    }

    const currentSign = Math.sign(z);

    if (sign === 0) {
      sign = currentSign;
      continue;
    }

    if (currentSign !== sign) {
      return false;
    }
  }

  return true;
}
