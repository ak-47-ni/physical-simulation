import type { SceneAuthoringSettings } from "./sceneAuthoringSettings";
import { convertLengthValue, convertMassValue } from "./sceneUnits";
import { canPlaceAuthoringEntity, createRepositionedEntity } from "./authoringOccupancy";
import { resolveAuthoringPlacement } from "./authoringContactSnap";
import type { EditorSceneEntity } from "./editorStore";

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
  position: { x: number; y: number };
}): EditorSceneEntity | null {
  const currentEntity = input.entities.find((entity) => entity.id === input.entityId);

  if (!currentEntity) {
    return null;
  }

  const candidate = createRepositionedEntity(currentEntity, input.position);
  const resolution = resolveAuthoringPlacement({
    candidate,
    entities: input.entities,
    ignoreEntityId: currentEntity.id,
    maxSnapDistance: 0,
  });

  return resolution.status === "blocked" ? null : resolution.entity;
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

  return {
    ...entity,
    x: Number((entity.x - DUPLICATE_OFFSET + offset).toFixed(6)),
    y: Number((entity.y - DUPLICATE_OFFSET + offset).toFixed(6)),
  };
}

export function replaceEntityInCollection(
  entities: EditorSceneEntity[],
  nextEntity: EditorSceneEntity,
): EditorSceneEntity[] {
  return entities.map((entity) => (entity.id === nextEntity.id ? nextEntity : entity));
}
