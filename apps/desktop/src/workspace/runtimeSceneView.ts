import type { EditorSceneEntity } from "../state/editorStore";
import type { RuntimeFrameView } from "../state/runtimeBridge";

type ProjectRuntimeSceneEntitiesInput = {
  editorEntities: EditorSceneEntity[];
  runtimeFrame: RuntimeFrameView | null;
};

export function projectRuntimeSceneEntities(
  input: ProjectRuntimeSceneEntitiesInput,
): EditorSceneEntity[] {
  const { editorEntities, runtimeFrame } = input;

  if (!runtimeFrame) {
    return editorEntities;
  }

  const runtimeEntitiesById = new Map(
    runtimeFrame.entities.map((entity) => [entity.id, entity] as const),
  );

  return editorEntities.map((editorEntity) => {
    const runtimeEntity = runtimeEntitiesById.get(editorEntity.id);

    if (!runtimeEntity) {
      return editorEntity;
    }

    if (editorEntity.kind === "ball") {
      return {
        ...editorEntity,
        x: runtimeEntity.transform.x - editorEntity.radius,
        y: runtimeEntity.transform.y - editorEntity.radius,
      };
    }

    return {
      ...editorEntity,
      x: runtimeEntity.transform.x - editorEntity.width / 2,
      y: runtimeEntity.transform.y - editorEntity.height / 2,
    };
  });
}
