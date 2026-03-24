import type { EditorSceneEntity } from "../state/editorStore";
import type { RuntimeFrameView } from "../state/runtimeBridge";
import {
  authoringLengthToScreenPixels,
  DEFAULT_WORKSPACE_VIEWPORT,
  projectAuthoringPointToScreen,
  projectSiPointToScreen,
  type UnitViewport,
} from "./unitViewport";

export type WorkspaceSceneEntity = EditorSceneEntity & {
  rotationDegrees?: number;
};

type ProjectRuntimeSceneEntitiesInput = {
  editorEntities: WorkspaceSceneEntity[];
  runtimeFrame: RuntimeFrameView | null;
  viewport?: UnitViewport;
};

function projectEditorEntityToScreen(
  entity: WorkspaceSceneEntity,
  viewport: UnitViewport,
): WorkspaceSceneEntity {
  const projectedPosition = projectAuthoringPointToScreen(
    {
      x: entity.x,
      y: entity.y,
    },
    viewport,
  );

  if (entity.kind === "ball") {
    return {
      ...entity,
      x: projectedPosition.x,
      y: projectedPosition.y,
      radius: authoringLengthToScreenPixels(entity.radius, viewport),
    };
  }

  return {
    ...entity,
    x: projectedPosition.x,
    y: projectedPosition.y,
    width: authoringLengthToScreenPixels(entity.width, viewport),
    height: authoringLengthToScreenPixels(entity.height, viewport),
  };
}

export function projectRuntimeSceneEntities(
  input: ProjectRuntimeSceneEntitiesInput,
): WorkspaceSceneEntity[] {
  const { editorEntities, runtimeFrame } = input;
  const viewport = input.viewport ?? DEFAULT_WORKSPACE_VIEWPORT;

  if (!runtimeFrame) {
    return editorEntities.map((entity) => projectEditorEntityToScreen(entity, viewport));
  }

  const runtimeEntitiesById = new Map(
    runtimeFrame.entities.map((entity) => [entity.id, entity] as const),
  );

  return editorEntities.map((editorEntity) => {
    const projectedEditorEntity = projectEditorEntityToScreen(editorEntity, viewport);
    const runtimeEntity = runtimeEntitiesById.get(editorEntity.id);

    if (!runtimeEntity) {
      return projectedEditorEntity;
    }

    const projectedRuntimeCenter = projectSiPointToScreen(
      {
        x: runtimeEntity.transform.x,
        y: runtimeEntity.transform.y,
      },
      viewport,
    );

    if (editorEntity.kind === "ball") {
      return {
        ...projectedEditorEntity,
        x: projectedRuntimeCenter.x - projectedEditorEntity.radius,
        y: projectedRuntimeCenter.y - projectedEditorEntity.radius,
      };
    }

    return {
      ...projectedEditorEntity,
      x: projectedRuntimeCenter.x - projectedEditorEntity.width / 2,
      y: projectedRuntimeCenter.y - projectedEditorEntity.height / 2,
    };
  });
}
