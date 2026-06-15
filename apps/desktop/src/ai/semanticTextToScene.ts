import { validateSceneDraft, type SceneDraft } from "./sceneDraft";
import { compileSceneIntentToDraft } from "./sceneIntentCompiler";
import { extractSceneIntent } from "./sceneIntent";
import { createSceneSemanticContext } from "./sceneSemanticKb";

const LOCAL_SEMANTIC_DRAFT_WARNING = "已使用本地语义规则生成受限场景草稿。";

export function createSceneDraftFromSemanticText(prompt: string): SceneDraft | null {
  const semanticContext = createSceneSemanticContext(prompt);
  const intent = extractSceneIntent({ prompt, semanticContext });

  if (!intent.objects.some((object) => isRenderableSupportedObjectKind(object.kind))) {
    return null;
  }

  const draft = compileSceneIntentToDraft({
    ...intent,
    warnings: [...intent.warnings, LOCAL_SEMANTIC_DRAFT_WARNING],
  });

  return validateSceneDraft(draft);
}

function isRenderableSupportedObjectKind(kind: string): boolean {
  return kind === "arc-track" || kind === "ball" || kind === "block" || kind === "board";
}
