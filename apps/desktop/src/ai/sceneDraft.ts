export type SceneDraftVector = {
  x: number;
  y: number;
};

export type SceneDraftEntityKind = "ball" | "block" | "board";

export type SceneDraftEntity = {
  angleDegrees?: number;
  friction?: number;
  height?: number;
  initialVelocity?: SceneDraftVector;
  kind: SceneDraftEntityKind;
  length?: number;
  locked?: boolean;
  mass?: number;
  name: string;
  radius?: number;
  restitution?: number;
  width?: number;
};

export type SceneDraftRelationship =
  | {
      entity: string;
      kind: "place-on";
      position?: "left" | "center" | "right";
      target: string;
    }
  | {
      entityA: string;
      entityB: string;
      kind: "spring-between";
      restLength?: number;
      stiffness?: number;
    };

export type SceneDraftAnalyzer = {
  entity: string;
  kind: "trajectory";
};

export type SceneDraft = {
  analyzers: SceneDraftAnalyzer[];
  assumptions: string[];
  domain: "mechanics";
  entities: SceneDraftEntity[];
  gravity?: number;
  locale: "zh-CN";
  relationships: SceneDraftRelationship[];
  title: string;
  unsupported: string[];
  warnings: string[];
};

export class SceneDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneDraftValidationError";
  }
}

const ENTITY_KINDS = new Set(["ball", "block", "board"]);
const RELATIONSHIP_KINDS = new Set(["place-on", "spring-between"]);
const PLACE_ON_POSITIONS = new Set(["left", "center", "right"]);

export function validateSceneDraft(candidate: unknown): SceneDraft {
  const value = readObject(candidate, "SceneDraft");

  if (value.domain !== "mechanics") {
    throw new SceneDraftValidationError("Scene draft domain must be mechanics.");
  }

  const warnings = readStringArray(value.warnings, "warnings");
  const entities = readArray(value.entities, "entities").map((entity, index) =>
    normalizeEntity(entity, index, warnings),
  );
  const entityNames = new Set(entities.map((entity) => entity.name));
  const relationships = readArray(value.relationships, "relationships").map((relationship, index) =>
    normalizeRelationship(relationship, index, entityNames),
  );
  const analyzers = readOptionalArray(value.analyzers, "analyzers").map((analyzer, index) =>
    normalizeAnalyzer(analyzer, index, entityNames),
  );

  return {
    analyzers,
    assumptions: readStringArray(value.assumptions, "assumptions"),
    domain: "mechanics",
    entities,
    gravity: readOptionalNumber(value.gravity, "gravity"),
    locale: value.locale === "zh-CN" ? "zh-CN" : "zh-CN",
    relationships,
    title: readOptionalString(value.title, "title") ?? "AI generated mechanics scene",
    unsupported: readStringArray(value.unsupported, "unsupported"),
    warnings,
  };
}

function normalizeEntity(
  candidate: unknown,
  index: number,
  warnings: string[],
): SceneDraftEntity {
  const value = readObject(candidate, `entities[${index}]`);
  const kind = readString(value.kind, `entities[${index}].kind`);

  if (!ENTITY_KINDS.has(kind)) {
    throw new SceneDraftValidationError(`Unknown entity kind: ${kind}`);
  }

  const name = readOptionalString(value.name, `entities[${index}].name`) ?? `${kind}-${index + 1}`;
  const mass = readOptionalNumber(value.mass, `entities[${index}].mass`);

  if (mass !== undefined && mass <= 0) {
    throw new SceneDraftValidationError(`Entity mass must be positive: ${name}`);
  }

  return {
    angleDegrees: readOptionalNumber(value.angleDegrees, `entities[${index}].angleDegrees`),
    friction: normalizeFriction(
      readOptionalNumber(value.friction, `entities[${index}].friction`),
      name,
      warnings,
    ),
    height: readOptionalPositiveNumber(value.height, `entities[${index}].height`),
    initialVelocity: readOptionalVector(value.initialVelocity, `entities[${index}].initialVelocity`),
    kind: kind as SceneDraftEntityKind,
    length: readOptionalPositiveNumber(value.length, `entities[${index}].length`),
    locked: typeof value.locked === "boolean" ? value.locked : undefined,
    mass,
    name,
    radius: readOptionalPositiveNumber(value.radius, `entities[${index}].radius`),
    restitution: readOptionalNumber(value.restitution, `entities[${index}].restitution`),
    width: readOptionalPositiveNumber(value.width, `entities[${index}].width`),
  };
}

function normalizeRelationship(
  candidate: unknown,
  index: number,
  entityNames: Set<string>,
): SceneDraftRelationship {
  const value = readObject(candidate, `relationships[${index}]`);
  const kind = readString(value.kind, `relationships[${index}].kind`);

  if (!RELATIONSHIP_KINDS.has(kind)) {
    throw new SceneDraftValidationError(`Unknown relationship kind: ${kind}`);
  }

  if (kind === "place-on") {
    const entity = readString(value.entity, `relationships[${index}].entity`);
    const target = readString(value.target, `relationships[${index}].target`);

    requireKnownEntity(entity, entityNames, `relationships[${index}].entity`);
    requireKnownEntity(target, entityNames, `relationships[${index}].target`);

    const rawPosition = readOptionalString(value.position, `relationships[${index}].position`);
    const position = rawPosition && PLACE_ON_POSITIONS.has(rawPosition) ? rawPosition : undefined;

    return {
      entity,
      kind: "place-on",
      position: position as SceneDraftRelationship["position"],
      target,
    };
  }

  const entityA = readString(value.entityA, `relationships[${index}].entityA`);
  const entityB = readString(value.entityB, `relationships[${index}].entityB`);

  requireKnownEntity(entityA, entityNames, `relationships[${index}].entityA`);
  requireKnownEntity(entityB, entityNames, `relationships[${index}].entityB`);

  return {
    entityA,
    entityB,
    kind: "spring-between",
    restLength: readOptionalPositiveNumber(value.restLength, `relationships[${index}].restLength`),
    stiffness: readOptionalPositiveNumber(value.stiffness, `relationships[${index}].stiffness`),
  };
}

function normalizeAnalyzer(
  candidate: unknown,
  index: number,
  entityNames: Set<string>,
): SceneDraftAnalyzer {
  const value = readObject(candidate, `analyzers[${index}]`);
  const kind = readString(value.kind, `analyzers[${index}].kind`);

  if (kind !== "trajectory") {
    throw new SceneDraftValidationError(`Unknown analyzer kind: ${kind}`);
  }

  const entity = readString(value.entity, `analyzers[${index}].entity`);
  requireKnownEntity(entity, entityNames, `analyzers[${index}].entity`);

  return {
    entity,
    kind: "trajectory",
  };
}

function normalizeFriction(
  friction: number | undefined,
  name: string,
  warnings: string[],
): number | undefined {
  if (friction === undefined) {
    return undefined;
  }

  if (friction < 0) {
    warnings.push(`${name} friction was negative and has been clamped to 0.`);
    return 0;
  }

  return friction;
}

function requireKnownEntity(value: string, entityNames: Set<string>, field: string) {
  if (!entityNames.has(value)) {
    throw new SceneDraftValidationError(`${field} references unknown entity: ${value}`);
  }
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SceneDraftValidationError(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SceneDraftValidationError(`${field} must be an array.`);
  }

  return value;
}

function readOptionalArray(value: unknown, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  return readArray(value, field);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SceneDraftValidationError(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readString(value, field);
}

function readStringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  return readArray(value, field).map((item, index) =>
    readString(item, `${field}[${index}]`),
  );
}

function readOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SceneDraftValidationError(`${field} must be a finite number.`);
  }

  return value;
}

function readOptionalPositiveNumber(value: unknown, field: string): number | undefined {
  const number = readOptionalNumber(value, field);

  if (number !== undefined && number <= 0) {
    throw new SceneDraftValidationError(`${field} must be positive.`);
  }

  return number;
}

function readOptionalVector(value: unknown, field: string): SceneDraftVector | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const vector = readObject(value, field);

  return {
    x: readOptionalNumber(vector.x, `${field}.x`) ?? 0,
    y: readOptionalNumber(vector.y, `${field}.y`) ?? 0,
  };
}
