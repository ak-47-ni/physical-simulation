import type { EditorConstraint } from "../state/editorConstraints";
import { DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION, type EditorSceneEntity } from "../state/editorStore";
import { reconcileManagedSmoothArcEntities } from "../state/managedSmoothArc";
import type { SceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { siMetersToAuthoringLength, type UnitViewport } from "../workspace/unitViewport";
import type { SceneDraft, SceneDraftEndpoint, SceneDraftEntity } from "./sceneDraft";

export type SceneDraftCompileMode = "insert" | "replace";

export type CompiledSceneDraft = {
  assumptions: string[];
  constraints: EditorConstraint[];
  entities: EditorSceneEntity[];
  gravity: number;
  selectedEntityId: string | null;
  visibleTrajectoryEntityIds: Set<string>;
  warnings: string[];
};

export type CompileSceneDraftInput = {
  draft: SceneDraft;
  existingConstraints: EditorConstraint[];
  existingEntities: EditorSceneEntity[];
  mode: SceneDraftCompileMode;
  settings: SceneAuthoringSettings;
};

type DraftEntityRecord = {
  draft: SceneDraftEntity;
  entity: EditorSceneEntity;
};
type NonArcDraftEntityRecord = DraftEntityRecord & {
  entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>;
};

const DEFAULT_BOARD_LENGTH_METERS = 5;
const DEFAULT_BOARD_HEIGHT_METERS = 0.14;
const DEFAULT_BLOCK_WIDTH_METERS = 0.84;
const DEFAULT_BLOCK_HEIGHT_METERS = 0.52;
const DEFAULT_BALL_RADIUS_METERS = 0.24;
const DEFAULT_START_X_METERS = 2.2;
const DEFAULT_START_Y_METERS = 2.6;
const DEFAULT_ENTITY_GAP_METERS = 1.1;
const DEFAULT_SPRING_STIFFNESS = 24;
const DEFAULT_PLACE_ON_EDGE_INSET_METERS = 0.2;
const DEFAULT_ARC_TRACK_RADIUS_METERS = 0.72;
const DEFAULT_ARC_TRACK_SWEEP_DEGREES = 90;
const DEFAULT_ARC_TRACK_THICKNESS_METERS = 0.18;
const DEFAULT_CONTACT_SPRING_END_MASS_KG = 0.05;
const DEFAULT_CONTACT_SPRING_END_REST_LENGTH_METERS = 0.5;
const DEFAULT_CONTACT_SPRING_END_WIDTH_METERS = 0.08;
const DEFAULT_CONTACT_SPRING_END_HEIGHT_METERS = 0.52;

export function compileSceneDraft(input: CompileSceneDraftInput): CompiledSceneDraft {
  const viewport = createDraftViewport(input.settings);
  const existingEntities = input.mode === "insert" ? input.existingEntities : [];
  const existingConstraints = input.mode === "insert" ? input.existingConstraints : [];
  const usedEntityIds = new Set(existingEntities.map((entity) => entity.id));
  const usedConstraintIds = new Set(existingConstraints.map((constraint) => constraint.id));
  const records = input.draft.entities.map((draftEntity, index) =>
    createDraftEntityRecord({
      draftEntity,
      index,
      viewport,
      usedEntityIds,
    }),
  );
  let recordByName = new Map(records.map((record) => [record.draft.name, record]));
  const anchoredRecords = resolveArcTrackAnchors({
    recordByName,
    records,
  });

  recordByName = new Map(anchoredRecords.map((record) => [record.draft.name, record]));
  const placedRecords = applyRelationships({
    draft: input.draft,
    recordByName,
    records: anchoredRecords,
    viewport,
  });
  const contactSpringEnds = createContactSpringEndRecords({
    draft: input.draft,
    recordByName,
    records: placedRecords,
    usedConstraintIds,
    usedEntityIds,
    viewport,
  });
  const recordsWithContactSpringEnds = contactSpringEnds.records;
  const recordByNameWithContactSpringEnds = contactSpringEnds.recordByName;
  applyEnergyReleaseInitialVelocities({
    draft: input.draft,
    records: recordsWithContactSpringEnds,
  });
  const placedEntities = applyManagedBoardSmoothArcConnections({
    draft: input.draft,
    recordByName: recordByNameWithContactSpringEnds,
    records: recordsWithContactSpringEnds,
  });
  const generatedConstraints = createDraftConstraints({
    draft: input.draft,
    hasContactSpringEnds: contactSpringEnds.constraints.length > 0,
    viewport,
    recordByName: recordByNameWithContactSpringEnds,
    usedConstraintIds,
    skipSpringBetweenRelationshipKeys: contactSpringEnds.skipSpringBetweenRelationshipKeys,
  });
  const visibleTrajectoryEntityIds = new Set<string>();

  for (const analyzer of input.draft.analyzers) {
    const record = recordByNameWithContactSpringEnds.get(analyzer.entity);

    if (record) {
      visibleTrajectoryEntityIds.add(record.entity.id);
    }
  }

  return {
    assumptions: input.draft.assumptions,
    constraints: [...existingConstraints, ...contactSpringEnds.constraints, ...generatedConstraints],
    entities: [...existingEntities, ...placedEntities],
    gravity: input.draft.gravity ?? input.settings.gravity,
    selectedEntityId: placedRecords[0]?.entity.id ?? null,
    visibleTrajectoryEntityIds,
    warnings: input.draft.warnings,
  };
}

function applyEnergyReleaseInitialVelocities(input: {
  draft: SceneDraft;
  records: DraftEntityRecord[];
}) {
  for (const relationship of input.draft.relationships) {
    if (relationship.kind !== "energy-release") {
      continue;
    }

    const recordA = input.records.find((record) => record.draft.name === relationship.entityA);
    const recordB = input.records.find((record) => record.draft.name === relationship.entityB);

    if (
      !recordA ||
      !recordB ||
      recordA.entity.kind === "arc-track" ||
      recordB.entity.kind === "arc-track"
    ) {
      continue;
    }

    const massA = recordA.entity.mass;
    const massB = recordB.entity.mass;

    if (massA <= 0 || massB <= 0) {
      continue;
    }

    const direction = normalizeEnergyReleaseDirection(relationship.direction);
    const speedA = Math.sqrt(
      (2 * relationship.totalKineticEnergy * massB) / (massA * (massA + massB)),
    );
    const speedB = (massA / massB) * speedA;

    recordA.entity.velocityX = roundPhysicsValue(direction.x * speedA);
    recordA.entity.velocityY = roundPhysicsValue(direction.y * speedA);
    recordB.entity.velocityX = roundPhysicsValue(-direction.x * speedB);
    recordB.entity.velocityY = roundPhysicsValue(-direction.y * speedB);
  }
}

function normalizeEnergyReleaseDirection(direction: SceneDraftEntity["initialVelocity"]): {
  x: number;
  y: number;
} {
  const rawDirection = direction ?? { x: 1, y: 0 };
  const length = Math.hypot(rawDirection.x, rawDirection.y);

  if (length <= Number.EPSILON) {
    return { x: 1, y: 0 };
  }

  return {
    x: rawDirection.x / length,
    y: rawDirection.y / length,
  };
}

function roundPhysicsValue(value: number): number {
  return Number(value.toFixed(6));
}

function createDraftEntityRecord(input: {
  draftEntity: SceneDraftEntity;
  index: number;
  viewport: UnitViewport;
  usedEntityIds: Set<string>;
}): DraftEntityRecord {
  const { draftEntity, index, viewport, usedEntityIds } = input;
  const id = createUniqueId(`ai-${draftEntity.kind}`, usedEntityIds);
  const basePhysics = {
    friction: draftEntity.friction ?? defaultFrictionForKind(draftEntity.kind),
    locked: draftEntity.locked ?? draftEntity.kind === "board",
    mass: draftEntity.mass ?? defaultMassForKind(draftEntity.kind),
    restitution: draftEntity.restitution ?? DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION,
    velocityX: draftEntity.initialVelocity?.x ?? 0,
    velocityY: draftEntity.initialVelocity?.y ?? 0,
  };
  const basePosition = {
    x: metersToAuthoringLength(DEFAULT_START_X_METERS + index * DEFAULT_ENTITY_GAP_METERS, viewport),
    y: metersToAuthoringLength(DEFAULT_START_Y_METERS, viewport),
  };
  const explicitCenter =
    draftEntity.center !== undefined
      ? {
          x: metersToAuthoringLength(draftEntity.center.x, viewport),
          y: metersToAuthoringLength(draftEntity.center.y, viewport),
        }
      : null;

  if (draftEntity.kind === "ball") {
    const radius = metersToAuthoringLength(draftEntity.radius ?? DEFAULT_BALL_RADIUS_METERS, viewport);

    return {
      draft: draftEntity,
      entity: {
        ...basePhysics,
        ...(explicitCenter
          ? {
              x: explicitCenter.x - radius,
              y: explicitCenter.y - radius,
            }
          : basePosition),
        id,
        kind: "ball",
        label: draftEntity.name,
        radius,
      },
    };
  }

  if (draftEntity.kind === "board") {
    const height = metersToAuthoringLength(draftEntity.height ?? DEFAULT_BOARD_HEIGHT_METERS, viewport);
    const width = metersToAuthoringLength(
      draftEntity.length ?? draftEntity.width ?? DEFAULT_BOARD_LENGTH_METERS,
      viewport,
    );

    return {
      draft: draftEntity,
      entity: {
        ...basePhysics,
        ...(explicitCenter
          ? {
              x: explicitCenter.x - width / 2,
              y: explicitCenter.y - height / 2,
            }
          : basePosition),
        height,
        id,
        kind: "board",
        label: draftEntity.name,
        rotationDegrees: draftEntity.angleDegrees ?? 0,
        width,
      },
    };
  }

  if (draftEntity.kind === "arc-track") {
    return {
      draft: draftEntity,
      entity: {
        anchorEndpoint: draftEntity.anchorEndpoint ?? "start",
        anchorEntityId: "",
        anchorEntityKind: "board",
        center: explicitCenter ?? basePosition,
        centralAngleDegrees: draftEntity.sweepAngleDegrees ?? DEFAULT_ARC_TRACK_SWEEP_DEGREES,
        entryEndpoint: draftEntity.entryEndpoint ?? "start",
        id,
        kind: "arc-track",
        label: draftEntity.name,
        physicsMode: "hybrid-rail-body",
        radius: metersToAuthoringLength(
          draftEntity.radius ?? DEFAULT_ARC_TRACK_RADIUS_METERS,
          viewport,
        ),
        rotationDegrees: draftEntity.angleDegrees ?? 0,
        side: draftEntity.side ?? "inside",
        sweepAngleDegrees: draftEntity.sweepAngleDegrees ?? DEFAULT_ARC_TRACK_SWEEP_DEGREES,
        thickness: metersToAuthoringLength(
          draftEntity.thickness ?? DEFAULT_ARC_TRACK_THICKNESS_METERS,
          viewport,
        ),
      },
    };
  }

  const height = metersToAuthoringLength(draftEntity.height ?? DEFAULT_BLOCK_HEIGHT_METERS, viewport);
  const width = metersToAuthoringLength(draftEntity.width ?? DEFAULT_BLOCK_WIDTH_METERS, viewport);

  return {
    draft: draftEntity,
    entity: {
      ...basePhysics,
      ...(explicitCenter
        ? {
            x: explicitCenter.x - width / 2,
            y: explicitCenter.y - height / 2,
          }
        : basePosition),
      height,
      id,
      kind: "block",
      label: draftEntity.name,
      rotationDegrees: draftEntity.angleDegrees ?? 0,
      width,
    },
  };
}

function resolveArcTrackAnchors(input: {
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
}): DraftEntityRecord[] {
  const fallbackAnchor = input.records.find(
    (record) => record.entity.kind === "board" || record.entity.kind === "block",
  );

  return input.records.map((record) => {
    if (record.entity.kind !== "arc-track") {
      return record;
    }

    const explicitAnchor = record.draft.anchorEntity
      ? input.recordByName.get(record.draft.anchorEntity)
      : null;
    const anchor =
      explicitAnchor && (explicitAnchor.entity.kind === "board" || explicitAnchor.entity.kind === "block")
        ? explicitAnchor
        : fallbackAnchor;

    if (!anchor || (anchor.entity.kind !== "board" && anchor.entity.kind !== "block")) {
      return record;
    }

    return {
      ...record,
      entity: {
        ...record.entity,
        anchorEndpoint: record.draft.anchorEndpoint ?? "start",
        anchorEntityId: anchor.entity.id,
        anchorEntityKind: anchor.entity.kind,
      },
    };
  });
}

function applyRelationships(input: {
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
  viewport: UnitViewport;
}): DraftEntityRecord[] {
  const placedById = new Map<string, EditorSceneEntity>();

  for (const record of input.records) {
    placedById.set(record.entity.id, record.entity);
  }

  for (const relationship of input.draft.relationships) {
    if (relationship.kind === "connect-endpoints") {
      const sourceRecord = input.recordByName.get(relationship.source);
      const targetRecord = input.recordByName.get(relationship.target);
      const source = sourceRecord ? placedById.get(sourceRecord.entity.id) : null;
      const target = targetRecord ? placedById.get(targetRecord.entity.id) : null;

      if (!source || !target) {
        continue;
      }

      const sourcePoint = readConnectionEndpoint(source, relationship.sourceEndpoint);
      const targetPoint = readConnectionEndpoint(target, relationship.targetEndpoint);

      placedById.set(
        target.id,
        translateEntity(target, {
          x: sourcePoint.x - targetPoint.x,
          y: sourcePoint.y - targetPoint.y,
        }),
      );
      continue;
    }

    if (relationship.kind !== "place-on") {
      continue;
    }

    const bodyRecord = input.recordByName.get(relationship.entity);
    const targetRecord = input.recordByName.get(relationship.target);

    if (
      !bodyRecord ||
      !targetRecord ||
      bodyRecord.entity.kind === "arc-track" ||
      targetRecord.entity.kind === "arc-track"
    ) {
      continue;
    }

    const target = targetRecord.entity;
    const body = bodyRecord.entity;
    const targetCenter = readEntityCenter(target);
    const targetTangent = readPlaceOnTangent(target);
    const contactNormal = readPlaceOnNormal(target);
    const bodyHalfDepth = readEntityHalfExtentAlongDirection(body, contactNormal);
    const targetHalfDepth = readEntityHalfExtentAlongDirection(target, contactNormal);
    const xOffset = readPlaceOnOffset(target, body, relationship.position, input.viewport);
    const bodyCenter = addVectors(
      addVectors(targetCenter, scaleVector(targetTangent, xOffset)),
      scaleVector(contactNormal, targetHalfDepth + bodyHalfDepth),
    );

    placedById.set(body.id, createEntityWithCenter(body, bodyCenter));
  }

  return input.records.map((record) => ({
    ...record,
    entity: placedById.get(record.entity.id) ?? record.entity,
  }));
}

function applyManagedBoardSmoothArcConnections(input: {
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
}): EditorSceneEntity[] {
  const placedById = new Map(input.records.map((record) => [record.entity.id, record.entity]));
  const replacedArcIds = new Set<string>();

  for (const connection of findBoardToBoardSmoothArcConnections(input)) {
    const source = placedById.get(connection.sourceRecord.entity.id);
    const target = placedById.get(connection.targetRecord.entity.id);

    if (!source || !target || source.kind !== "board" || target.kind !== "board") {
      continue;
    }

    const sourcePoint = readConnectionEndpoint(source, connection.sourceEndpoint);
    const targetPoint = readConnectionEndpoint(target, connection.targetEndpoint);

    placedById.set(
      target.id,
      translateEntity(target, {
        x: sourcePoint.x - targetPoint.x,
        y: sourcePoint.y - targetPoint.y,
      }),
    );

    if (connection.bridgeArcRecord) {
      replacedArcIds.add(connection.bridgeArcRecord.entity.id);
    }
  }

  const entities = input.records
    .filter((record) => !replacedArcIds.has(record.entity.id))
    .map((record) => placedById.get(record.entity.id) ?? record.entity);

  return reconcileManagedSmoothArcEntities({
    createMissing: replacedArcIds.size > 0 || entitiesNeedManagedSmoothArc(input.draft),
    entities,
  });
}

function findBoardToBoardSmoothArcConnections(input: {
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
}): Array<{
  bridgeArcRecord: DraftEntityRecord | null;
  sourceEndpoint: SceneDraftEndpoint;
  sourceRecord: DraftEntityRecord;
  targetEndpoint: SceneDraftEndpoint;
  targetRecord: DraftEntityRecord;
}> {
  const connections = input.draft.relationships.filter(
    (relationship): relationship is Extract<SceneDraft["relationships"][number], { kind: "connect-endpoints" }> =>
      relationship.kind === "connect-endpoints",
  );
  const result: Array<{
    bridgeArcRecord: DraftEntityRecord | null;
    sourceEndpoint: SceneDraftEndpoint;
    sourceRecord: DraftEntityRecord;
    targetEndpoint: SceneDraftEndpoint;
    targetRecord: DraftEntityRecord;
  }> = [];

  for (const connection of connections) {
    const sourceRecord = input.recordByName.get(connection.source);
    const targetRecord = input.recordByName.get(connection.target);

    if (
      sourceRecord?.entity.kind === "board" &&
      targetRecord?.entity.kind === "board"
    ) {
      result.push({
        bridgeArcRecord: null,
        sourceEndpoint: connection.sourceEndpoint,
        sourceRecord,
        targetEndpoint: connection.targetEndpoint,
        targetRecord,
      });
    }
  }

  for (const bridgeRecord of input.recordByName.values()) {
    if (bridgeRecord.entity.kind !== "arc-track") {
      continue;
    }

    const incoming = connections.find((connection) => connection.target === bridgeRecord.draft.name);
    const outgoing = connections.find((connection) => connection.source === bridgeRecord.draft.name);
    const sourceRecord = incoming ? input.recordByName.get(incoming.source) : null;
    const targetRecord = outgoing ? input.recordByName.get(outgoing.target) : null;

    if (
      !incoming ||
      !outgoing ||
      sourceRecord?.entity.kind !== "board" ||
      targetRecord?.entity.kind !== "board"
    ) {
      continue;
    }

    result.push({
      bridgeArcRecord: bridgeRecord,
      sourceEndpoint: incoming.sourceEndpoint,
      sourceRecord,
      targetEndpoint: outgoing.targetEndpoint,
      targetRecord,
    });
  }

  return result;
}

function entitiesNeedManagedSmoothArc(draft: SceneDraft): boolean {
  return draft.relationships.some((relationship) => relationship.kind === "connect-endpoints");
}

function readConnectionEndpoint(entity: EditorSceneEntity, endpoint: SceneDraftEndpoint): {
  x: number;
  y: number;
} {
  if (entity.kind === "arc-track") {
    const halfSweep = entity.sweepAngleDegrees / 2;
    const angleDegrees =
      endpoint === "start"
        ? entity.rotationDegrees - halfSweep
        : entity.rotationDegrees + halfSweep;
    const angleRadians = (angleDegrees * Math.PI) / 180;

    return {
      x: entity.center.x + Math.cos(angleRadians) * entity.radius,
      y: entity.center.y - Math.sin(angleRadians) * entity.radius,
    };
  }

  if (entity.kind === "ball") {
    return readEntityCenter(entity);
  }

  const center = readEntityCenter(entity);
  const axes = readRectangleAxes(entity);
  const sign = endpoint === "start" ? -1 : 1;

  return addVectors(
    addVectors(center, scaleVector(axes.axisX, (sign * entity.width) / 2)),
    scaleVector(axes.axisY, -entity.height / 2),
  );
}

function translateEntity<T extends EditorSceneEntity>(
  entity: T,
  delta: { x: number; y: number },
): T {
  if (entity.kind === "arc-track") {
    return {
      ...entity,
      center: addVectors(entity.center, delta),
    };
  }

  return {
    ...entity,
    x: entity.x + delta.x,
    y: entity.y + delta.y,
  };
}

function readPlaceOnOffset(
  target: Exclude<EditorSceneEntity, { kind: "arc-track" }>,
  body: Exclude<EditorSceneEntity, { kind: "arc-track" }>,
  position: "left" | "center" | "right" | undefined,
  viewport: UnitViewport,
): number {
  if (target.kind === "ball") {
    return 0;
  }

  const edgeInset = metersToAuthoringLength(DEFAULT_PLACE_ON_EDGE_INSET_METERS, viewport);
  const bodyHalfLength = readEntityHalfExtentAlongDirection(body, readPlaceOnTangent(target));
  const edgeOffset = Math.max(target.width / 2 - bodyHalfLength - edgeInset, 0);

  if (position === "left") {
    return -edgeOffset;
  }

  if (position === "right") {
    return edgeOffset;
  }

  return 0;
}

function readEntityCenter(entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>): {
  x: number;
  y: number;
} {
  if (entity.kind === "ball") {
    return {
      x: entity.x + entity.radius,
      y: entity.y + entity.radius,
    };
  }

  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

function createEntityWithCenter<T extends Exclude<EditorSceneEntity, { kind: "arc-track" }>>(
  entity: T,
  center: { x: number; y: number },
): T {
  if (entity.kind === "ball") {
    return {
      ...entity,
      x: center.x - entity.radius,
      y: center.y - entity.radius,
    };
  }

  return {
    ...entity,
    x: center.x - entity.width / 2,
    y: center.y - entity.height / 2,
  };
}

function readPlaceOnTangent(
  entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>,
): { x: number; y: number } {
  if (entity.kind === "ball") {
    return { x: 1, y: 0 };
  }

  return readRectangleAxes(entity).axisX;
}

function readPlaceOnNormal(
  entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>,
): { x: number; y: number } {
  if (entity.kind === "ball") {
    return { x: 0, y: -1 };
  }

  return scaleVector(readRectangleAxes(entity).axisY, -1);
}

function readEntityHalfExtentAlongDirection(
  entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>,
  direction: { x: number; y: number },
): number {
  if (entity.kind === "ball") {
    return entity.radius;
  }

  const axes = readRectangleAxes(entity);

  return (
    Math.abs(dot(direction, axes.axisX)) * (entity.width / 2) +
    Math.abs(dot(direction, axes.axisY)) * (entity.height / 2)
  );
}

function readRectangleAxes(entity: Exclude<EditorSceneEntity, { kind: "ball" | "arc-track" }>): {
  axisX: { x: number; y: number };
  axisY: { x: number; y: number };
} {
  const rotationRadians = (((entity.rotationDegrees ?? 0) * Math.PI) / 180);

  return {
    axisX: {
      x: Math.cos(rotationRadians),
      y: Math.sin(rotationRadians),
    },
    axisY: {
      x: -Math.sin(rotationRadians),
      y: Math.cos(rotationRadians),
    },
  };
}

function addVectors(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function scaleVector(
  vector: { x: number; y: number },
  factor: number,
): { x: number; y: number } {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
  };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

type ContactSpringEndSpec = {
  anchorRecord: DraftEntityRecord;
  gapMeters: number;
  legacySpringBetweenKey?: string;
  restLengthMeters: number;
  stiffness: number;
  targetRecord: DraftEntityRecord;
};

function createContactSpringEndRecords(input: {
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
  usedConstraintIds: Set<string>;
  usedEntityIds: Set<string>;
  viewport: UnitViewport;
}): {
  constraints: EditorConstraint[];
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
  skipSpringBetweenRelationshipKeys: Set<string>;
} {
  const specs = collectContactSpringEndSpecs(input);
  const nextRecords = [...input.records];
  const recordByName = new Map(input.recordByName);
  const skipSpringBetweenRelationshipKeys = new Set<string>();
  const constraints: EditorConstraint[] = [];

  for (const spec of specs) {
    if (spec.anchorRecord.entity.kind === "arc-track" || spec.targetRecord.entity.kind === "arc-track") {
      continue;
    }

    if (spec.legacySpringBetweenKey) {
      skipSpringBetweenRelationshipKeys.add(spec.legacySpringBetweenKey);
    }

    const axis = readContactSpringAxis({
      anchorRecord: spec.anchorRecord,
      draft: input.draft,
      recordByName,
      targetRecord: spec.targetRecord,
    });
    const restLength = metersToAuthoringLength(spec.restLengthMeters, input.viewport);
    const gap = metersToAuthoringLength(spec.gapMeters, input.viewport);
    const width = metersToAuthoringLength(DEFAULT_CONTACT_SPRING_END_WIDTH_METERS, input.viewport);
    const height = readContactSpringEndHeight(spec.targetRecord.entity, input.viewport);
    const anchorCenter = readEntityCenter(spec.anchorRecord.entity);
    const targetEntity = spec.targetRecord.entity;
    const rotationDegrees = readContactSpringRotationDegrees({
      anchorRecord: spec.anchorRecord,
      draft: input.draft,
      recordByName,
      targetRecord: spec.targetRecord,
    });
    const contactEndId = createUniqueId("ai-block", input.usedEntityIds);
    const contactEndName = createGeneratedContactSpringEndName(recordByName);
    const provisionalContactEnd = {
      friction: 0,
      height,
      id: contactEndId,
      kind: "block" as const,
      label: contactEndName,
      locked: false,
      mass: DEFAULT_CONTACT_SPRING_END_MASS_KG,
      restitution: 1,
      rotationDegrees,
      velocityX: 0,
      velocityY: 0,
      width,
      x: 0,
      y: 0,
    };
    const contactHalfExtent = readEntityHalfExtentAlongDirection(provisionalContactEnd, axis);
    const targetHalfExtent = readEntityHalfExtentAlongDirection(targetEntity, axis);
    const contactCenter = addVectors(anchorCenter, scaleVector(axis, restLength));
    const targetCenter = addVectors(
      contactCenter,
      scaleVector(axis, contactHalfExtent + gap + targetHalfExtent),
    );
    const contactEnd = createEntityWithCenter(provisionalContactEnd, contactCenter);
    const nextTargetEntity = createEntityWithCenter(targetEntity, targetCenter);

    replaceRecordEntity(nextRecords, spec.targetRecord.entity.id, nextTargetEntity);
    const targetRecord = recordByName.get(spec.targetRecord.draft.name);

    if (targetRecord) {
      recordByName.set(spec.targetRecord.draft.name, {
        ...targetRecord,
        entity: nextTargetEntity,
      });
    }

    const contactRecord: DraftEntityRecord = {
      draft: {
        friction: 0,
        height,
        kind: "block",
        locked: false,
        mass: DEFAULT_CONTACT_SPRING_END_MASS_KG,
        name: contactEndName,
        restitution: 1,
        width,
      },
      entity: contactEnd,
    };

    nextRecords.push(contactRecord);
    recordByName.set(contactEndName, contactRecord);
    constraints.push({
      entityAId: spec.anchorRecord.entity.id,
      entityBId: contactEnd.id,
      id: createUniqueId("ai-spring", input.usedConstraintIds),
      kind: "spring",
      label: "AI Contact Spring",
      restLength,
      stiffness: spec.stiffness,
    });
  }

  return {
    constraints,
    recordByName,
    records: nextRecords,
    skipSpringBetweenRelationshipKeys,
  };
}

function collectContactSpringEndSpecs(input: {
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  records: DraftEntityRecord[];
  viewport: UnitViewport;
}): ContactSpringEndSpec[] {
  const textHints = readSpringTextHints(input.draft, input.records);
  const gapHintMeters = readSpringGapHintMeters(textHints);
  const explicitSpecs: ContactSpringEndSpec[] = [];
  const usedPairs = new Set<string>();

  for (const relationship of input.draft.relationships) {
    if (relationship.kind === "contact-spring-end") {
      const anchorRecord = input.recordByName.get(relationship.anchor);
      const targetRecord = input.recordByName.get(relationship.target);

      if (!anchorRecord || !targetRecord) {
        continue;
      }

      const pairKey = createContactSpringPairKey(anchorRecord.draft.name, targetRecord.draft.name);
      usedPairs.add(pairKey);
      explicitSpecs.push({
        anchorRecord,
        gapMeters: relationship.gap ?? readSpringGapHintMeters(textHints) ?? 0,
        restLengthMeters: relationship.restLength ?? DEFAULT_CONTACT_SPRING_END_REST_LENGTH_METERS,
        stiffness: relationship.stiffness ?? readSpringStiffnessHint(textHints) ?? DEFAULT_SPRING_STIFFNESS,
        targetRecord,
      });
      continue;
    }

    if (relationship.kind !== "spring-between") {
      continue;
    }

    const recordA = input.recordByName.get(relationship.entityA);
    const recordB = input.recordByName.get(relationship.entityB);
    const contactPair = readLegacyContactSpringPair(recordA, recordB, {
      allowGenericFixedAnchor: gapHintMeters !== null,
    });

    if (!contactPair) {
      continue;
    }

    const pairKey = createContactSpringPairKey(
      contactPair.anchorRecord.draft.name,
      contactPair.targetRecord.draft.name,
    );

    if (usedPairs.has(pairKey)) {
      continue;
    }

    usedPairs.add(pairKey);
    explicitSpecs.push({
      anchorRecord: contactPair.anchorRecord,
      gapMeters: gapHintMeters ?? relationship.restLength ?? 0,
      legacySpringBetweenKey: createSpringBetweenRelationshipKey(relationship.entityA, relationship.entityB),
      restLengthMeters: DEFAULT_CONTACT_SPRING_END_REST_LENGTH_METERS,
      stiffness: relationship.stiffness ?? readSpringStiffnessHint(textHints) ?? DEFAULT_SPRING_STIFFNESS,
      targetRecord: contactPair.targetRecord,
    });
  }

  if (explicitSpecs.length > 0) {
    return explicitSpecs;
  }

  if (input.draft.relationships.some((relationship) => relationship.kind === "spring-between")) {
    return [];
  }

  if (gapHintMeters === null) {
    return [];
  }

  const anchorRecord = input.records.find((record) => isFixedSpringAnchorRecord(record));

  if (!anchorRecord) {
    return [];
  }

  const anchorCenter = readNonArcEntityCenter(anchorRecord.entity);

  if (!anchorCenter) {
    return [];
  }

  const targetRecord = input.records
    .filter((record) => record !== anchorRecord && isContactSpringTargetRecord(record))
    .reduce<DraftEntityRecord | null>((closest, record) => {
      const center = readNonArcEntityCenter(record.entity);

      if (!center) {
        return closest;
      }

      if (!closest) {
        return record;
      }

      const closestCenter = readNonArcEntityCenter(closest.entity);

      return closestCenter &&
        distanceBetweenPoints(anchorCenter, center) < distanceBetweenPoints(anchorCenter, closestCenter)
        ? record
        : closest;
    }, null);

  if (!targetRecord) {
    return [];
  }

  return [
    {
      anchorRecord,
      gapMeters: gapHintMeters,
      restLengthMeters: DEFAULT_CONTACT_SPRING_END_REST_LENGTH_METERS,
      stiffness: readSpringStiffnessHint(textHints) ?? DEFAULT_SPRING_STIFFNESS,
      targetRecord,
    },
  ];
}

function readLegacyContactSpringPair(
  recordA: DraftEntityRecord | undefined,
  recordB: DraftEntityRecord | undefined,
  options: { allowGenericFixedAnchor: boolean } = { allowGenericFixedAnchor: false },
): { anchorRecord: DraftEntityRecord; targetRecord: DraftEntityRecord } | null {
  if (!recordA || !recordB) {
    return null;
  }

  if (
    isLegacyContactSpringAnchorRecord(recordA, options) &&
    isContactSpringTargetRecord(recordB)
  ) {
    return { anchorRecord: recordA, targetRecord: recordB };
  }

  if (
    isLegacyContactSpringAnchorRecord(recordB, options) &&
    isContactSpringTargetRecord(recordA)
  ) {
    return { anchorRecord: recordB, targetRecord: recordA };
  }

  return null;
}

function isLegacyContactSpringAnchorRecord(
  record: DraftEntityRecord,
  options: { allowGenericFixedAnchor: boolean },
): record is NonArcDraftEntityRecord {
  return (
    isFixedSpringAnchorRecord(record) ||
    (options.allowGenericFixedAnchor &&
      record.entity.kind !== "arc-track" &&
      record.entity.kind !== "board" &&
      record.entity.locked)
  );
}

function isFixedSpringAnchorRecord(record: DraftEntityRecord): record is NonArcDraftEntityRecord {
  return (
    record.entity.kind !== "arc-track" &&
    isSpringLikeName(record.draft.name) &&
    (record.entity.locked || record.draft.name.includes("固定"))
  );
}

function isContactSpringTargetRecord(record: DraftEntityRecord): record is NonArcDraftEntityRecord {
  return (
    record.entity.kind !== "arc-track" &&
    !record.entity.locked &&
    (record.entity.kind === "ball" || record.entity.kind === "block")
  );
}

function readContactSpringAxis(input: {
  anchorRecord: DraftEntityRecord;
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  targetRecord: DraftEntityRecord;
}): { x: number; y: number } {
  const trackRecord = readContactSpringTrackRecord(input);
  const anchorPlacement = readPlaceOnRelationship(input.draft, input.anchorRecord.draft.name);

  if (trackRecord && trackRecord.entity.kind !== "arc-track") {
    const tangent = readPlaceOnTangent(trackRecord.entity);

    if (anchorPlacement?.position === "left") {
      return tangent;
    }

    return scaleVector(tangent, -1);
  }

  const anchorCenter = readNonArcEntityCenter(input.anchorRecord.entity);
  const targetCenter = readNonArcEntityCenter(input.targetRecord.entity);

  if (anchorCenter && targetCenter) {
    const delta = {
      x: targetCenter.x - anchorCenter.x,
      y: targetCenter.y - anchorCenter.y,
    };
    const length = Math.hypot(delta.x, delta.y);

    if (length > 0.0001) {
      return {
        x: delta.x / length,
        y: delta.y / length,
      };
    }
  }

  return { x: -1, y: 0 };
}

function readContactSpringRotationDegrees(input: {
  anchorRecord: DraftEntityRecord;
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  targetRecord: DraftEntityRecord;
}): number {
  const trackRecord = readContactSpringTrackRecord(input);

  if (
    trackRecord &&
    trackRecord.entity.kind !== "arc-track" &&
    trackRecord.entity.kind !== "ball"
  ) {
    return trackRecord.entity.rotationDegrees ?? 0;
  }

  return 0;
}

function readContactSpringTrackRecord(input: {
  anchorRecord: DraftEntityRecord;
  draft: SceneDraft;
  recordByName: Map<string, DraftEntityRecord>;
  targetRecord: DraftEntityRecord;
}): DraftEntityRecord | null {
  const anchorPlacement = readPlaceOnRelationship(input.draft, input.anchorRecord.draft.name);
  const targetPlacement = readPlaceOnRelationship(input.draft, input.targetRecord.draft.name);
  const sharedTarget =
    anchorPlacement?.target && anchorPlacement.target === targetPlacement?.target
      ? anchorPlacement.target
      : anchorPlacement?.target ?? targetPlacement?.target;

  return sharedTarget ? input.recordByName.get(sharedTarget) ?? null : null;
}

function readPlaceOnRelationship(
  draft: SceneDraft,
  entityName: string,
): Extract<SceneDraft["relationships"][number], { kind: "place-on" }> | null {
  return (
    draft.relationships.find(
      (relationship): relationship is Extract<SceneDraft["relationships"][number], { kind: "place-on" }> =>
        relationship.kind === "place-on" && relationship.entity === entityName,
    ) ?? null
  );
}

function readContactSpringEndHeight(entity: Exclude<EditorSceneEntity, { kind: "arc-track" }>, viewport: UnitViewport): number {
  if (entity.kind === "ball") {
    return entity.radius * 2;
  }

  return Math.max(
    metersToAuthoringLength(DEFAULT_CONTACT_SPRING_END_HEIGHT_METERS, viewport),
    entity.height,
  );
}

function readNonArcEntityCenter(entity: EditorSceneEntity): { x: number; y: number } | null {
  return entity.kind === "arc-track" ? null : readEntityCenter(entity);
}

function replaceRecordEntity<T extends Exclude<EditorSceneEntity, { kind: "arc-track" }>>(
  records: DraftEntityRecord[],
  entityId: string,
  entity: T,
): void {
  const index = records.findIndex((record) => record.entity.id === entityId);

  if (index === -1) {
    return;
  }

  records[index] = {
    ...records[index],
    entity,
  };
}

function createGeneratedContactSpringEndName(recordByName: Map<string, DraftEntityRecord>): string {
  let index = 1;
  let name = "弹簧接触端";

  while (recordByName.has(name)) {
    index += 1;
    name = `弹簧接触端 ${index}`;
  }

  return name;
}

function createContactSpringPairKey(anchorName: string, targetName: string): string {
  return `${anchorName}\u0000${targetName}`;
}

function createSpringBetweenRelationshipKey(entityA: string, entityB: string): string {
  return `${entityA}\u0000${entityB}`;
}

function readSpringTextHints(draft: SceneDraft, records: DraftEntityRecord[]): string[] {
  return [
    draft.title,
    ...draft.assumptions,
    ...draft.warnings,
    ...draft.unsupported,
    ...records.map((record) => record.draft.name),
  ];
}

function createDraftConstraints(input: {
  draft: SceneDraft;
  hasContactSpringEnds: boolean;
  viewport: UnitViewport;
  recordByName: Map<string, DraftEntityRecord>;
  skipSpringBetweenRelationshipKeys: Set<string>;
  usedConstraintIds: Set<string>;
}): EditorConstraint[] {
  const textHints = readSpringTextHints(input.draft, [...input.recordByName.values()]);
  const explicitSpringConstraints = input.draft.relationships.flatMap((relationship) => {
    if (relationship.kind !== "spring-between") {
      return [];
    }

    if (
      input.skipSpringBetweenRelationshipKeys.has(
        createSpringBetweenRelationshipKey(relationship.entityA, relationship.entityB),
      )
    ) {
      return [];
    }

    const recordA = input.recordByName.get(relationship.entityA);
    const recordB = input.recordByName.get(relationship.entityB);

    if (!recordA || !recordB || recordA.entity.kind === "arc-track" || recordB.entity.kind === "arc-track") {
      return [];
    }

    return [
      {
        entityAId: recordA.entity.id,
        entityBId: recordB.entity.id,
        id: createUniqueId("ai-spring", input.usedConstraintIds),
        kind: "spring" as const,
        label: "AI Spring",
        restLength:
          relationship.restLength !== undefined
            ? metersToAuthoringLength(relationship.restLength, input.viewport)
            : roundPixels(
                Math.hypot(recordB.entity.x - recordA.entity.x, recordB.entity.y - recordA.entity.y),
              ),
        stiffness: relationship.stiffness ?? readSpringStiffnessHint(textHints) ?? DEFAULT_SPRING_STIFFNESS,
      },
    ];
  });

  return [
    ...explicitSpringConstraints,
    ...inferImplicitSpringConstraints({
      draft: input.draft,
      explicitSpringConstraints,
      hasContactSpringEnds: input.hasContactSpringEnds,
      recordByName: input.recordByName,
      usedConstraintIds: input.usedConstraintIds,
      viewport: input.viewport,
    }),
  ];
}

function inferImplicitSpringConstraints(input: {
  draft: SceneDraft;
  explicitSpringConstraints: EditorConstraint[];
  hasContactSpringEnds: boolean;
  recordByName: Map<string, DraftEntityRecord>;
  usedConstraintIds: Set<string>;
  viewport: UnitViewport;
}): EditorConstraint[] {
  if (
    input.hasContactSpringEnds ||
    input.explicitSpringConstraints.some((constraint) => constraint.kind === "spring")
  ) {
    return [];
  }

  const records = [...input.recordByName.values()];
  const anchor = records.find(isFixedSpringAnchorRecord);

  if (!anchor) {
    return [];
  }

  const candidates = records.filter(
    (record): record is NonArcDraftEntityRecord =>
      record !== anchor && isContactSpringTargetRecord(record),
  );

  if (candidates.length === 0) {
    return [];
  }

  const anchorCenter = readEntityCenter(anchor.entity);
  const target = candidates.reduce((closest, candidate) => {
    const closestDistance = distanceBetweenPoints(anchorCenter, readEntityCenter(closest.entity));
    const candidateDistance = distanceBetweenPoints(anchorCenter, readEntityCenter(candidate.entity));

    return candidateDistance < closestDistance ? candidate : closest;
  });
  const textHints = [
    input.draft.title,
    ...input.draft.assumptions,
    ...input.draft.warnings,
    ...input.draft.unsupported,
    ...records.map((record) => record.draft.name),
  ];
  const restLength = readSpringGapHintMeters(textHints);

  return [
    {
      entityAId: anchor.entity.id,
      entityBId: target.entity.id,
      id: createUniqueId("ai-spring", input.usedConstraintIds),
      kind: "spring",
      label: "AI Spring",
      restLength:
        restLength !== null
          ? metersToAuthoringLength(restLength, input.viewport)
          : roundPixels(distanceBetweenPoints(anchorCenter, readEntityCenter(target.entity))),
      stiffness: readSpringStiffnessHint(textHints) ?? DEFAULT_SPRING_STIFFNESS,
    },
  ];
}

function isSpringLikeName(name: string): boolean {
  return /弹簧|spring/i.test(name);
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function readSpringStiffnessHint(texts: string[]): number | null {
  for (const text of texts) {
    const match =
      text.match(/(?:劲度系数|k|K)\s*[=＝:]?\s*([0-9]+(?:\.[0-9]+)?)/) ??
      text.match(/([0-9]+(?:\.[0-9]+)?)\s*N\s*\/\s*m/i);

    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function readSpringGapHintMeters(texts: string[]): number | null {
  for (const text of texts) {
    const match = text.match(/(?:x[0₀]|间距|距离|相距)\s*[=＝:]?\s*([0-9]+(?:\.[0-9]+)?)/i);

    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function defaultFrictionForKind(kind: SceneDraftEntity["kind"]): number {
  return kind === "board" ? 0.42 : 0;
}

function defaultMassForKind(kind: SceneDraftEntity["kind"]): number {
  return kind === "board" ? 5 : 1;
}

function createUniqueId(prefix: string, usedIds: Set<string>): string {
  let index = 1;
  let id = `${prefix}-${index}`;

  while (usedIds.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }

  usedIds.add(id);
  return id;
}

function createDraftViewport(settings: SceneAuthoringSettings): UnitViewport {
  return {
    lengthUnit: settings.lengthUnit,
    pixelsPerMeter: settings.pixelsPerMeter,
  };
}

function metersToAuthoringLength(value: number, viewport: UnitViewport): number {
  return siMetersToAuthoringLength(value, viewport);
}

function roundPixels(value: number): number {
  return Number(value.toFixed(2));
}
