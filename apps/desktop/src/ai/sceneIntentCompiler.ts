import { validateSceneDraft, type SceneDraft, type SceneDraftEntity, type SceneDraftRelationship } from "./sceneDraft";
import type { SceneIntent, SceneIntentObject, SceneIntentRelationship } from "./sceneIntent";

export function compileSceneIntentToDraft(intent: SceneIntent): SceneDraft {
  const entities = intent.objects.map(mapIntentObjectToDraftEntity);
  const nameById = new Map(intent.objects.map((object) => [object.id, object.label]));
  const relationships = intent.relationships.flatMap((relationship) =>
    mapIntentRelationshipToDraftRelationships(relationship, nameById),
  );
  const movingEntityNames = intent.objects
    .filter((object) => object.role === "moving-body")
    .map((object) => object.label);

  return validateSceneDraft({
    analyzers: movingEntityNames.map((entity) => ({ entity, kind: "trajectory" })),
    assumptions: [...intent.assumptions],
    domain: "mechanics",
    entities,
    gravity: 9.8,
    locale: "zh-CN",
    relationships,
    schemaVersion: 1,
    title: intent.title,
    unsupported: [...intent.unsupported],
    warnings: [...intent.warnings],
  });
}

function mapIntentObjectToDraftEntity(object: SceneIntentObject): SceneDraftEntity {
  const parameters = object.parameters ?? {};

  if (object.kind === "ball") {
    return {
      initialVelocity: parameters.initialVelocity,
      kind: "ball",
      mass: parameters.massKg,
      name: object.label,
      radius: parameters.radiusMeters,
    };
  }

  if (object.kind === "board") {
    return {
      angleDegrees: parameters.angleDegrees,
      friction: parameters.friction,
      height: parameters.heightMeters ?? 0.14,
      kind: "board",
      length: parameters.lengthMeters ?? (object.role === "support-incline" ? 4 : 5),
      locked: parameters.locked ?? true,
      name: object.label,
    };
  }

  if (object.kind === "arc-track") {
    return {
      anchorEndpoint: "end",
      anchorEntity: "斜面",
      entryEndpoint: "start",
      kind: "arc-track",
      name: object.label,
      radius: 0.72,
      side: "inside",
      sweepAngleDegrees: 90,
      thickness: 0.18,
    };
  }

  return {
    friction: parameters.friction,
    height: parameters.heightMeters ?? (object.role === "spring-anchor" ? 0.5 : 0.4),
    initialVelocity: parameters.initialVelocity,
    kind: "block",
    locked: parameters.locked,
    mass: parameters.massKg,
    name: object.label,
    width: object.role === "spring-anchor" ? 0.16 : 0.7,
  };
}

function mapIntentRelationshipToDraftRelationships(
  relationship: SceneIntentRelationship,
  nameById: Map<string, string>,
): SceneDraftRelationship[] {
  if (relationship.kind === "place-on") {
    const entity = relationship.a ? nameById.get(relationship.a) : null;
    const target = relationship.target ? nameById.get(relationship.target) : null;

    if (!entity || !target) {
      return [];
    }

    return [
      {
        entity,
        kind: "place-on",
        position: relationship.parameters?.position,
        target,
      },
    ];
  }

  if (relationship.kind === "spring-between" || relationship.kind === "contact-spring-end") {
    const entityA = relationship.a ? nameById.get(relationship.a) : null;
    const entityB = relationship.b ? nameById.get(relationship.b) : null;

    if (!entityA || !entityB) {
      return [];
    }

    return [
      {
        entityA,
        entityB,
        kind: "spring-between",
        restLength: relationship.parameters?.restLengthMeters ?? 1,
        stiffness: relationship.parameters?.stiffness ?? 20,
      },
    ];
  }

  const source = relationship.a ? nameById.get(relationship.a) : null;
  const target = relationship.b ? nameById.get(relationship.b) : null;

  if (!source || !target) {
    return [];
  }

  const bridge = readArcBridgeName(nameById);

  if (bridge && bridge !== source && bridge !== target) {
    return [
      {
        kind: "connect-endpoints",
        source,
        sourceEndpoint: relationship.sourceEndpoint ?? "end",
        target: bridge,
        targetEndpoint: "start",
      },
      {
        kind: "connect-endpoints",
        source: bridge,
        sourceEndpoint: "end",
        target,
        targetEndpoint: relationship.targetEndpoint ?? "start",
      },
    ];
  }

  return [
    {
      kind: "connect-endpoints",
      source,
      sourceEndpoint: relationship.sourceEndpoint ?? "end",
      target,
      targetEndpoint: relationship.targetEndpoint ?? "start",
    },
  ];
}

function readArcBridgeName(nameById: Map<string, string>): string | null {
  for (const [id, name] of nameById) {
    if (id.startsWith("arc-bridge")) {
      return name;
    }
  }

  return null;
}
