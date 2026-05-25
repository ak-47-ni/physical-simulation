import type { EditorConstraint } from "../state/editorConstraints";
import type { EditorSceneEntity } from "../state/editorStore";
import type { CompiledSceneDraft } from "./sceneDraftCompiler";

export type SceneGenerationBaselineSummary = {
  constraints: unknown[];
  entities: unknown[];
  entityKindCounts: Record<string, number>;
  gravity: number;
  visibleTrajectoryEntityIds: string[];
};

export function createSceneGenerationBaselineSummary(
  compiled: CompiledSceneDraft,
): SceneGenerationBaselineSummary {
  return {
    constraints: compiled.constraints.map(summarizeConstraint),
    entities: compiled.entities.map(summarizeEntity),
    entityKindCounts: countEntityKinds(compiled.entities),
    gravity: roundStableNumber(compiled.gravity),
    visibleTrajectoryEntityIds: [...compiled.visibleTrajectoryEntityIds].sort(),
  };
}

export function hashSceneGenerationBaselineSummary(value: unknown): string {
  return fnv1a32(stableStringify(value));
}

function summarizeEntity(entity: EditorSceneEntity): unknown {
  if (entity.kind === "arc-track") {
    return {
      anchorEntityId: entity.anchorEntityId,
      anchorEntityKind: entity.anchorEntityKind,
      anchorEndpoint: entity.anchorEndpoint,
      entryEndpoint: entity.entryEndpoint,
      id: entity.id,
      kind: entity.kind,
      managedConnection: entity.managedConnection
        ? {
            sourceEndpoint: entity.managedConnection.sourceEndpoint,
            sourceEntityId: entity.managedConnection.sourceEntityId,
            targetEndpoint: entity.managedConnection.targetEndpoint,
            targetEntityId: entity.managedConnection.targetEntityId,
          }
        : null,
      physicsMode: entity.physicsMode,
      rotationDegrees: roundStableNumber(entity.rotationDegrees),
      shape: {
        radius: roundStableNumber(entity.radius),
        sweepAngleDegrees: roundStableNumber(entity.sweepAngleDegrees),
        thickness: roundStableNumber(entity.thickness),
      },
      side: entity.side,
    };
  }

  if (entity.kind === "ball") {
    return {
      friction: roundStableNumber(entity.friction),
      id: entity.id,
      kind: entity.kind,
      locked: entity.locked,
      mass: roundStableNumber(entity.mass),
      restitution: roundStableNumber(entity.restitution),
      shape: {
        radius: roundStableNumber(entity.radius),
      },
      velocity: {
        x: roundStableNumber(entity.velocityX),
        y: roundStableNumber(entity.velocityY),
      },
    };
  }

  return {
    friction: roundStableNumber(entity.friction),
    id: entity.id,
    kind: entity.kind,
    locked: entity.locked,
    mass: roundStableNumber(entity.mass),
    restitution: roundStableNumber(entity.restitution),
    rotationDegrees: roundStableNumber(entity.rotationDegrees ?? 0),
    shape: {
      height: roundStableNumber(entity.height),
      width: roundStableNumber(entity.width),
    },
    velocity: {
      x: roundStableNumber(entity.velocityX),
      y: roundStableNumber(entity.velocityY),
    },
  };
}

function summarizeConstraint(constraint: EditorConstraint): unknown {
  if (constraint.kind === "spring") {
    return {
      entityAId: constraint.entityAId,
      entityBId: constraint.entityBId,
      id: constraint.id,
      kind: constraint.kind,
      restLength: roundStableNumber(constraint.restLength),
      stiffness: roundStableNumber(constraint.stiffness),
    };
  }

  if (constraint.kind === "track") {
    return {
      axis: {
        x: roundStableNumber(constraint.axis.x),
        y: roundStableNumber(constraint.axis.y),
      },
      entityId: constraint.entityId,
      id: constraint.id,
      kind: constraint.kind,
    };
  }

  return {
    endAngleDegrees: roundStableNumber(constraint.endAngleDegrees),
    entryEndpoint: constraint.entryEndpoint,
    id: constraint.id,
    kind: constraint.kind,
    radius: roundStableNumber(constraint.radius),
    side: constraint.side,
    startAngleDegrees: roundStableNumber(constraint.startAngleDegrees),
  };
}

function countEntityKinds(entities: EditorSceneEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entity of entities) {
    counts[entity.kind] = (counts[entity.kind] ?? 0) + 1;
  }

  return counts;
}

function roundStableNumber(value: number): number {
  return Number(value.toFixed(6));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

