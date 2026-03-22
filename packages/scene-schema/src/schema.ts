export const SCENE_SCHEMA_VERSION = 1;

export type Vector2 = {
  x: number;
  y: number;
};

export type UserPolygonEntity = {
  id: string;
  kind: "user-polygon";
  points: Vector2[];
};

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
};

export type AnnotationStroke = {
  id: string;
  points: Vector2[];
};

export type SceneDocument = {
  schemaVersion: number;
  entities: UserPolygonEntity[];
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
}): UserPolygonEntity {
  if (!isConvexPolygon(input.points)) {
    throw new Error("User polygon entities must be convex in v1.");
  }

  return {
    id: input.id,
    kind: "user-polygon",
    points: input.points,
  };
}

export function requiresRuntimeRebuild(scopes: DirtyEditScope[]): boolean {
  return scopes.includes("structure") || scopes.includes("physics");
}

function cross(o: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
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
