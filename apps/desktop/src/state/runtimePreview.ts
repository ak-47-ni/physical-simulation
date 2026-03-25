import type { UnitViewport } from "../workspace/unitViewport";
import { projectAuthoringPointToSi } from "../workspace/unitViewport";
import type { EditorSceneEntity } from "./editorStore";
import type {
  RuntimeBridgePortSnapshot,
  RuntimeTrajectorySample,
} from "./runtimeBridge";
import type { SceneAuthoringSettings } from "./sceneAuthoringSettings";
import {
  normalizeGravityToSi,
  normalizeVelocityToSi,
} from "./sceneUnits";
import { authoringVelocityToRuntime } from "./velocitySemantics";

function getEntityCenter(entity: EditorSceneEntity) {
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

export function createRuntimePreviewFrame(
  entities: EditorSceneEntity[],
  settings: SceneAuthoringSettings,
  viewport: UnitViewport,
  input: RuntimeBridgePortSnapshot & { nextFrameNumber: number },
) {
  const elapsedTimeSeconds = input.bridge.currentTimeSeconds;
  const gravityAccelerationSi = normalizeGravityToSi(settings.gravity, settings.lengthUnit);

  return {
    frameNumber: input.nextFrameNumber,
    entities: entities.map((entity) => {
      const centerSi = projectAuthoringPointToSi(getEntityCenter(entity), viewport);
      const runtimeVelocity = authoringVelocityToRuntime({
        velocityX: normalizeVelocityToSi(entity.velocityX, settings.velocityUnit),
        velocityY: normalizeVelocityToSi(entity.velocityY, settings.velocityUnit),
      });
      const velocityXSi = runtimeVelocity.velocityX;
      const velocityYSi = runtimeVelocity.velocityY;
      const timeAdjustedPosition = entity.locked
        ? centerSi
        : {
            x: centerSi.x + velocityXSi * elapsedTimeSeconds,
            y:
              centerSi.y +
              velocityYSi * elapsedTimeSeconds +
              0.5 * gravityAccelerationSi * elapsedTimeSeconds * elapsedTimeSeconds,
          };

      return {
        entityId: entity.id,
        position: timeAdjustedPosition,
        rotation: 0,
        velocity: entity.locked
          ? { x: 0, y: 0 }
          : {
              x: velocityXSi,
              y: velocityYSi + gravityAccelerationSi * elapsedTimeSeconds,
            },
        acceleration: entity.locked ? { x: 0, y: 0 } : { x: 0, y: gravityAccelerationSi },
      };
    }),
  };
}

export function createRuntimePreviewTrajectorySamples(input: {
  analyzerId: string;
  bridge: RuntimeBridgePortSnapshot["bridge"];
  currentSamplesByAnalyzer: Record<string, RuntimeTrajectorySample[]>;
}) {
  const trackedEntity = input.bridge.currentFrame?.entities[0];

  if (!trackedEntity) {
    return input.currentSamplesByAnalyzer;
  }

  return {
    [input.analyzerId]: [
      ...(input.currentSamplesByAnalyzer[input.analyzerId] ?? []),
      {
        frameNumber: input.bridge.currentFrame?.frameNumber ?? 0,
        timeSeconds: input.bridge.currentTimeSeconds,
        position: {
          x: trackedEntity.transform.x,
          y: trackedEntity.transform.y,
        },
        velocity: trackedEntity.velocity ?? { x: 0, y: 0 },
        acceleration: trackedEntity.acceleration ?? { x: 0, y: 0 },
      },
    ],
  };
}
