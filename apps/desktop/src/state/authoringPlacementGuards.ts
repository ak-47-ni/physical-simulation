import type { SceneAuthoringSettings } from "./sceneAuthoringSettings";
import { convertLengthValue, convertMassValue, type LengthUnit } from "./sceneUnits";
import { canPlaceAuthoringEntity, createRepositionedEntity } from "./authoringOccupancy";
import {
  resolveAuthoringPlacement,
  type AuthoringPlacementResolution,
} from "./authoringContactSnap";
import type { EditorSceneEntity } from "./editorStore";
import { normalizeAuthoredPositionForCommit } from "./authoringDomain";

const LEGACY_LENGTH_UNIT = "cm";
const LEGACY_MASS_UNIT = "kg";
const DUPLICATE_OFFSET = 24;

export function canPlaceAuthoringCandidate(
  candidate: EditorSceneEntity,
  entities: EditorSceneEntity[],
): boolean {
  return canPlaceAuthoringEntity({
    candidate,
    entities,
  });
}

export function findRepositionedAuthoringEntity(input: {
  entities: EditorSceneEntity[];
  entityId: string;
  lengthUnit?: LengthUnit;
  position: { x: number; y: number };
}): EditorSceneEntity | null {
  const currentEntity = input.entities.find((entity) => entity.id === input.entityId);

  if (!currentEntity) {
    return null;
  }

  const candidate = createRepositionedEntity(currentEntity, input.position);
  const resolution = resolveAuthoringPlacementForCommit({
    candidate,
    entities: input.entities,
    ignoreEntityId: currentEntity.id,
    lengthUnit: input.lengthUnit ?? "m",
    maxSnapDistance: 0,
  });

  return resolution.status === "blocked" ? null : resolution.entity;
}

export function normalizeAuthoringEntityPositionForCommit<T extends EditorSceneEntity>(
  entity: T,
  lengthUnit: LengthUnit,
): T {
  return createRepositionedEntity(
    entity,
    normalizeAuthoredPositionForCommit(
      {
        x: entity.x,
        y: entity.y,
      },
      lengthUnit,
    ),
  );
}

export function resolveAuthoringPlacementForCommit(input: {
  candidate: EditorSceneEntity;
  entities: EditorSceneEntity[];
  ignoreEntityId?: string;
  lengthUnit: LengthUnit;
  maxSnapDistance: number;
}): AuthoringPlacementResolution {
  const resolution = resolveAuthoringPlacement({
    candidate: input.candidate,
    entities: input.entities,
    ignoreEntityId: input.ignoreEntityId,
    maxSnapDistance: input.maxSnapDistance,
  });

  if (resolution.status === "blocked") {
    return resolution;
  }

  const normalizedEntity = normalizeAuthoringEntityPositionForCommit(
    resolution.entity,
    input.lengthUnit,
  );

  if (
    !canPlaceAuthoringEntity({
      candidate: normalizedEntity,
      entities: input.entities,
      ignoreEntityId: input.ignoreEntityId,
    })
  ) {
    return {
      status: "blocked",
      entity: null,
    };
  }

  return {
    ...resolution,
    entity: normalizedEntity,
  };
}

export function convertLegacyCreatedEntityToSceneUnits(
  entity: EditorSceneEntity,
  settings: SceneAuthoringSettings,
  position: { x: number; y: number },
): EditorSceneEntity {
  const mass = convertMassValue(entity.mass, LEGACY_MASS_UNIT, settings.massUnit);

  if (entity.kind === "ball") {
    return {
      ...entity,
      x: position.x,
      y: position.y,
      mass,
      radius: convertLengthValue(entity.radius, LEGACY_LENGTH_UNIT, settings.lengthUnit),
    };
  }

  return {
    ...entity,
    x: position.x,
    y: position.y,
    mass,
    width: convertLengthValue(entity.width, LEGACY_LENGTH_UNIT, settings.lengthUnit),
    height: convertLengthValue(entity.height, LEGACY_LENGTH_UNIT, settings.lengthUnit),
  };
}

export function applySceneDuplicateOffset(
  entity: EditorSceneEntity,
  settings: SceneAuthoringSettings,
): EditorSceneEntity {
  const offset = convertLengthValue(DUPLICATE_OFFSET, LEGACY_LENGTH_UNIT, settings.lengthUnit);

  return normalizeAuthoringEntityPositionForCommit(
    {
      ...entity,
      x: Number((entity.x - DUPLICATE_OFFSET + offset).toFixed(6)),
      y: Number((entity.y - DUPLICATE_OFFSET + offset).toFixed(6)),
    },
    settings.lengthUnit,
  );
}

export function replaceEntityInCollection(
  entities: EditorSceneEntity[],
  nextEntity: EditorSceneEntity,
): EditorSceneEntity[] {
  return entities.map((entity) => (entity.id === nextEntity.id ? nextEntity : entity));
}
