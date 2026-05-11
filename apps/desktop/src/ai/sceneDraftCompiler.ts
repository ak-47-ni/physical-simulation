import type { EditorConstraint } from "../state/editorConstraints";
import { DEFAULT_CLASSROOM_RIGID_BODY_RESTITUTION, type EditorSceneEntity } from "../state/editorStore";
import type { SceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { siMetersToAuthoringLength, type UnitViewport } from "../workspace/unitViewport";
import type { SceneDraft, SceneDraftEntity } from "./sceneDraft";

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
  const recordByName = new Map(records.map((record) => [record.draft.name, record]));
  const placedRecords = applyRelationships({
    draft: input.draft,
    recordByName,
    records,
    viewport,
  });
  const generatedConstraints = createDraftConstraints({
    draft: input.draft,
    viewport,
    recordByName,
    usedConstraintIds,
  });
  const visibleTrajectoryEntityIds = new Set<string>();

  for (const analyzer of input.draft.analyzers) {
    const record = recordByName.get(analyzer.entity);

    if (record) {
      visibleTrajectoryEntityIds.add(record.entity.id);
    }
  }

  return {
    assumptions: input.draft.assumptions,
    constraints: [...existingConstraints, ...generatedConstraints],
    entities: [...existingEntities, ...placedRecords.map((record) => record.entity)],
    gravity: input.draft.gravity ?? input.settings.gravity,
    selectedEntityId: placedRecords[0]?.entity.id ?? null,
    visibleTrajectoryEntityIds,
    warnings: input.draft.warnings,
  };
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

  if (draftEntity.kind === "ball") {
    return {
      draft: draftEntity,
      entity: {
        ...basePhysics,
        ...basePosition,
        id,
        kind: "ball",
        label: draftEntity.name,
        radius: metersToAuthoringLength(draftEntity.radius ?? DEFAULT_BALL_RADIUS_METERS, viewport),
      },
    };
  }

  if (draftEntity.kind === "board") {
    return {
      draft: draftEntity,
      entity: {
        ...basePhysics,
        ...basePosition,
        height: metersToAuthoringLength(draftEntity.height ?? DEFAULT_BOARD_HEIGHT_METERS, viewport),
        id,
        kind: "board",
        label: draftEntity.name,
        rotationDegrees: draftEntity.angleDegrees ?? 0,
        width: metersToAuthoringLength(
          draftEntity.length ?? draftEntity.width ?? DEFAULT_BOARD_LENGTH_METERS,
          viewport,
        ),
      },
    };
  }

  return {
    draft: draftEntity,
    entity: {
      ...basePhysics,
      ...basePosition,
      height: metersToAuthoringLength(draftEntity.height ?? DEFAULT_BLOCK_HEIGHT_METERS, viewport),
      id,
      kind: "block",
      label: draftEntity.name,
      rotationDegrees: draftEntity.angleDegrees ?? 0,
      width: metersToAuthoringLength(draftEntity.width ?? DEFAULT_BLOCK_WIDTH_METERS, viewport),
    },
  };
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
    if (relationship.kind !== "place-on") {
      continue;
    }

    const bodyRecord = input.recordByName.get(relationship.entity);
    const targetRecord = input.recordByName.get(relationship.target);

    if (!bodyRecord || !targetRecord || targetRecord.entity.kind === "arc-track") {
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

function createDraftConstraints(input: {
  draft: SceneDraft;
  viewport: UnitViewport;
  recordByName: Map<string, DraftEntityRecord>;
  usedConstraintIds: Set<string>;
}): EditorConstraint[] {
  return input.draft.relationships.flatMap((relationship) => {
    if (relationship.kind !== "spring-between") {
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
        stiffness: relationship.stiffness ?? DEFAULT_SPRING_STIFFNESS,
      },
    ];
  });
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
