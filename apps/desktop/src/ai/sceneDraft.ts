export type SceneDraftVector = {
  x: number;
  y: number;
};

export type SceneDraftEndpoint = "start" | "end";

export type SceneDraftEntityKind = "arc-track" | "ball" | "block" | "board";

export type SceneDraftEntity = {
  angleDegrees?: number;
  anchorEndpoint?: SceneDraftEndpoint;
  anchorEntity?: string;
  center?: SceneDraftVector;
  entryEndpoint?: SceneDraftEndpoint;
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
  side?: "inside" | "outside";
  sweepAngleDegrees?: number;
  thickness?: number;
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
      anchor: string;
      gap?: number;
      kind: "contact-spring-end";
      restLength?: number;
      stiffness?: number;
      target: string;
    }
  | {
      direction?: SceneDraftVector;
      entityA: string;
      entityB: string;
      kind: "energy-release";
      totalKineticEnergy: number;
    }
  | {
      entityA: string;
      entityB: string;
      kind: "spring-between";
      restLength?: number;
      stiffness?: number;
    }
  | {
      kind: "connect-endpoints";
      source: string;
      sourceEndpoint: SceneDraftEndpoint;
      target: string;
      targetEndpoint: SceneDraftEndpoint;
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

const ENTITY_KINDS = new Set(["arc-track", "ball", "block", "board"]);
const RELATIONSHIP_KINDS = new Set([
  "connect-endpoints",
  "contact-spring-end",
  "energy-release",
  "place-on",
  "spring-between",
]);
const PLACE_ON_POSITIONS = new Set(["left", "center", "right"]);
const ENDPOINT_KEYS = new Set(["start", "end"]);
const ARC_TRACK_SIDES = new Set(["inside", "outside"]);
const IMPLICIT_GROUND_ENTITY_NAME = "水平地面";
const IMPLICIT_GROUND_ALIASES = new Set([
  "ground",
  "groundplane",
  "groundsurface",
  "horizontalground",
  "floor",
  "horizontalfloor",
  "地面",
  "水平地面",
  "水平面",
  "水平地板",
  "地板",
]);

export function validateSceneDraft(candidate: unknown): SceneDraft {
  const value = readObject(candidate, "SceneDraft");

  if (value.domain !== "mechanics") {
    throw new SceneDraftValidationError("Scene draft domain must be mechanics.");
  }

  const warnings = readStringArray(value.warnings, "warnings");
  const assumptions = readStringArray(value.assumptions, "assumptions");
  const entities = readArray(value.entities, "entities").map((entity, index) =>
    normalizeEntity(entity, index, warnings),
  );
  const rawRelationships = readArray(value.relationships, "relationships");
  const implicitSupports = normalizeImplicitSupportEntities({
    assumptions,
    entities,
    relationships: rawRelationships,
  });
  const entityNames = new Set(implicitSupports.entities.map((entity) => entity.name));
  const relationships = rawRelationships.map((relationship, index) =>
    normalizeRelationship(
      relationship,
      index,
      entityNames,
      implicitSupports.relationshipReferenceAliases,
    ),
  );
  const analyzers = readOptionalArray(value.analyzers, "analyzers").map((analyzer, index) =>
    normalizeAnalyzer(analyzer, index, implicitSupports.entities),
  );

  return {
    analyzers,
    assumptions,
    domain: "mechanics",
    entities: implicitSupports.entities,
    gravity: readOptionalNumber(value.gravity, "gravity"),
    locale: value.locale === "zh-CN" ? "zh-CN" : "zh-CN",
    relationships,
    title: readOptionalString(value.title, "title") ?? "AI generated mechanics scene",
    unsupported: readStringArray(value.unsupported, "unsupported"),
    warnings,
  };
}

function normalizeImplicitSupportEntities(input: {
  assumptions: string[];
  entities: SceneDraftEntity[];
  relationships: unknown[];
}): {
  entities: SceneDraftEntity[];
  relationshipReferenceAliases: Map<string, string>;
} {
  const entities = [...input.entities];
  const relationshipReferenceAliases = new Map<string, string>();
  let groundName = entities.find(
    (entity) => entity.kind === "board" && isImplicitGroundReference(entity.name),
  )?.name;

  for (const relationship of input.relationships) {
    if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
      continue;
    }

    const value = relationship as Record<string, unknown>;

    if (value.kind !== "place-on" || typeof value.target !== "string") {
      continue;
    }

    if (!isImplicitGroundReference(value.target)) {
      continue;
    }

    if (!groundName) {
      groundName = createUniqueEntityName(IMPLICIT_GROUND_ENTITY_NAME, entities);
      entities.push({
        angleDegrees: 0,
        kind: "board",
        length: 8,
        locked: true,
        name: groundName,
      });
      pushUniqueAssumption(
        input.assumptions,
        "题干引用了地面/水平面，已自动创建锁定的水平地面。",
      );
    }

    relationshipReferenceAliases.set(normalizeReferenceKey(value.target), groundName);
  }

  return {
    entities,
    relationshipReferenceAliases,
  };
}

function createUniqueEntityName(baseName: string, entities: SceneDraftEntity[]): string {
  const names = new Set(entities.map((entity) => entity.name));

  if (!names.has(baseName)) {
    return baseName;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${baseName} ${index}`;

    if (!names.has(candidate)) {
      return candidate;
    }
  }
}

function pushUniqueAssumption(assumptions: string[], assumption: string) {
  if (!assumptions.includes(assumption)) {
    assumptions.push(assumption);
  }
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
  const height = normalizeEntityHeight({
    height: readOptionalPositiveNumber(value.height, `entities[${index}].height`),
    kind: kind as SceneDraftEntityKind,
    name,
    warnings,
  });

  if (mass !== undefined && mass <= 0) {
    throw new SceneDraftValidationError(`Entity mass must be positive: ${name}`);
  }

  return {
    angleDegrees: readOptionalNumber(value.angleDegrees, `entities[${index}].angleDegrees`),
    anchorEndpoint: readOptionalEndpoint(value.anchorEndpoint, `entities[${index}].anchorEndpoint`),
    anchorEntity: readOptionalString(value.anchorEntity, `entities[${index}].anchorEntity`),
    center: readOptionalVector(value.center, `entities[${index}].center`),
    entryEndpoint: readOptionalEndpoint(value.entryEndpoint, `entities[${index}].entryEndpoint`),
    friction: normalizeFriction(
      readOptionalNumber(value.friction, `entities[${index}].friction`),
      name,
      warnings,
    ),
    height,
    initialVelocity: readOptionalVector(value.initialVelocity, `entities[${index}].initialVelocity`),
    kind: kind as SceneDraftEntityKind,
    length: readOptionalPositiveNumber(value.length, `entities[${index}].length`),
    locked: typeof value.locked === "boolean" ? value.locked : undefined,
    mass,
    name,
    radius: readOptionalPositiveNumber(value.radius, `entities[${index}].radius`),
    restitution: readOptionalNumber(value.restitution, `entities[${index}].restitution`),
    side: readOptionalArcTrackSide(value.side, `entities[${index}].side`),
    sweepAngleDegrees: readOptionalPositiveNumber(
      value.sweepAngleDegrees,
      `entities[${index}].sweepAngleDegrees`,
    ),
    thickness: readOptionalPositiveNumber(value.thickness, `entities[${index}].thickness`),
    width: readOptionalPositiveNumber(value.width, `entities[${index}].width`),
  };
}

function normalizeEntityHeight(input: {
  height: number | undefined;
  kind: SceneDraftEntityKind;
  name: string;
  warnings: string[];
}): number | undefined {
  if (input.height === undefined) {
    return undefined;
  }

  if (input.kind === "board" && input.height > 0.5) {
    input.warnings.push(
      `${input.name} height looked like an exam vertical-height value and was ignored as rail thickness.`,
    );
    return undefined;
  }

  return input.height;
}

function normalizeRelationship(
  candidate: unknown,
  index: number,
  entityNames: Set<string>,
  relationshipReferenceAliases: Map<string, string>,
): SceneDraftRelationship {
  const value = readObject(candidate, `relationships[${index}]`);
  const kind = readString(value.kind, `relationships[${index}].kind`);

  if (!RELATIONSHIP_KINDS.has(kind)) {
    throw new SceneDraftValidationError(`Unknown relationship kind: ${kind}`);
  }

  if (kind === "place-on") {
    const entity = readString(value.entity, `relationships[${index}].entity`);
    const rawTarget = readString(value.target, `relationships[${index}].target`);
    const target = resolveKnownEntityReference(rawTarget, relationshipReferenceAliases);

    requireKnownEntity(entity, entityNames, `relationships[${index}].entity`);
    requireKnownEntity(target, entityNames, `relationships[${index}].target`);

    const rawPosition = readOptionalString(value.position, `relationships[${index}].position`);
    const position = rawPosition && PLACE_ON_POSITIONS.has(rawPosition) ? rawPosition : undefined;

    return {
      entity,
      kind: "place-on",
      position: position as Extract<SceneDraftRelationship, { kind: "place-on" }>["position"],
      target,
    };
  }

  if (kind === "connect-endpoints") {
    const source = readString(value.source, `relationships[${index}].source`);
    const target = readString(value.target, `relationships[${index}].target`);

    requireKnownEntity(source, entityNames, `relationships[${index}].source`);
    requireKnownEntity(target, entityNames, `relationships[${index}].target`);

    return {
      kind: "connect-endpoints",
      source,
      sourceEndpoint: readEndpoint(value.sourceEndpoint, `relationships[${index}].sourceEndpoint`),
      target,
      targetEndpoint: readEndpoint(value.targetEndpoint, `relationships[${index}].targetEndpoint`),
    };
  }

  if (kind === "contact-spring-end") {
    const anchor = readString(value.anchor, `relationships[${index}].anchor`);
    const target = readString(value.target, `relationships[${index}].target`);

    requireKnownEntity(anchor, entityNames, `relationships[${index}].anchor`);
    requireKnownEntity(target, entityNames, `relationships[${index}].target`);

    return {
      anchor,
      gap: readOptionalNonNegativeNumber(value.gap, `relationships[${index}].gap`),
      kind: "contact-spring-end",
      restLength: readOptionalPositiveRelationshipNumber(
        value.restLength,
        `relationships[${index}].restLength`,
      ),
      stiffness: readOptionalPositiveRelationshipNumber(
        value.stiffness,
        `relationships[${index}].stiffness`,
      ),
      target,
    };
  }

  if (kind === "energy-release") {
    const entityA = readString(value.entityA, `relationships[${index}].entityA`);
    const entityB = readString(value.entityB, `relationships[${index}].entityB`);

    requireKnownEntity(entityA, entityNames, `relationships[${index}].entityA`);
    requireKnownEntity(entityB, entityNames, `relationships[${index}].entityB`);

    return {
      direction: readOptionalNonZeroVector(value.direction, `relationships[${index}].direction`),
      entityA,
      entityB,
      kind: "energy-release",
      totalKineticEnergy: readPositiveNumber(
        value.totalKineticEnergy,
        `relationships[${index}].totalKineticEnergy`,
      ),
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
    restLength: readOptionalPositiveRelationshipNumber(
      value.restLength,
      `relationships[${index}].restLength`,
    ),
    stiffness: readOptionalPositiveRelationshipNumber(
      value.stiffness,
      `relationships[${index}].stiffness`,
    ),
  };
}

function resolveKnownEntityReference(value: string, aliases: Map<string, string>): string {
  return aliases.get(normalizeReferenceKey(value)) ?? value;
}

function normalizeAnalyzer(
  candidate: unknown,
  index: number,
  entities: SceneDraftEntity[],
): SceneDraftAnalyzer {
  const value = readObject(candidate, `analyzers[${index}]`);
  const kind = readString(value.kind, `analyzers[${index}].kind`);

  if (kind !== "trajectory") {
    throw new SceneDraftValidationError(`Unknown analyzer kind: ${kind}`);
  }

  const entity = readString(value.entity, `analyzers[${index}].entity`);
  const normalizedEntity = resolveAnalyzerEntityReference(
    entity,
    entities,
    `analyzers[${index}].entity`,
  );

  return {
    entity: normalizedEntity,
    kind: "trajectory",
  };
}

function resolveAnalyzerEntityReference(
  entity: string,
  entities: SceneDraftEntity[],
  field: string,
): string {
  if (entities.some((candidate) => candidate.name === entity)) {
    return entity;
  }

  const normalizedKind = normalizeGenericEntityKindReference(entity);
  const matches = normalizedKind
    ? entities.filter((candidate) => candidate.kind === normalizedKind)
    : [];

  if (matches.length === 1) {
    return matches[0].name;
  }

  throw new SceneDraftValidationError(`${field} references unknown entity: ${entity}`);
}

function normalizeGenericEntityKindReference(value: string): SceneDraftEntityKind | null {
  const normalized = value.trim().toLowerCase();

  if (["ball", "小球", "球"].includes(normalized)) {
    return "ball";
  }

  if (["block", "wood block", "木块", "物块", "滑块"].includes(normalized)) {
    return "block";
  }

  if (["board", "track", "rail", "木板", "斜面", "轨道"].includes(normalized)) {
    return "board";
  }

  if (["arc", "arc-track", "circular arc", "圆弧", "圆弧轨道"].includes(normalized)) {
    return "arc-track";
  }

  return null;
}

function isImplicitGroundReference(value: string): boolean {
  return IMPLICIT_GROUND_ALIASES.has(normalizeReferenceKey(value));
}

function normalizeReferenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
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

function readPositiveNumber(value: unknown, field: string): number {
  const number = readOptionalNumber(value, field);

  if (number === undefined || number <= 0) {
    throw new SceneDraftValidationError(`${field} must be positive.`);
  }

  return number;
}

function readOptionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  const number = readOptionalNumber(value, field);

  if (number !== undefined && number < 0) {
    throw new SceneDraftValidationError(`${field} must be non-negative.`);
  }

  return number;
}

function readOptionalPositiveRelationshipNumber(
  value: unknown,
  field: string,
): number | undefined {
  const number = readOptionalNumber(value, field);

  if (number === undefined || number === 0) {
    return undefined;
  }

  if (number < 0) {
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

function readOptionalNonZeroVector(value: unknown, field: string): SceneDraftVector | undefined {
  const vector = readOptionalVector(value, field);

  if (vector === undefined) {
    return undefined;
  }

  if (Math.hypot(vector.x, vector.y) <= Number.EPSILON) {
    throw new SceneDraftValidationError(`${field} must be non-zero.`);
  }

  return vector;
}

function readEndpoint(value: unknown, field: string): SceneDraftEndpoint {
  const endpoint = readString(value, field);

  if (!ENDPOINT_KEYS.has(endpoint)) {
    throw new SceneDraftValidationError(`${field} must be start or end.`);
  }

  return endpoint as SceneDraftEndpoint;
}

function readOptionalEndpoint(value: unknown, field: string): SceneDraftEndpoint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readEndpoint(value, field);
}

function readOptionalArcTrackSide(value: unknown, field: string): "inside" | "outside" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const side = readString(value, field);

  if (!ARC_TRACK_SIDES.has(side)) {
    throw new SceneDraftValidationError(`${field} must be inside or outside.`);
  }

  return side as "inside" | "outside";
}
