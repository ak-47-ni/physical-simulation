import { SceneDraftValidationError, validateSceneDraft, type SceneDraft } from "./sceneDraft";
import { createSceneDraftFallbackFromText } from "./sceneDraftFallback";
import { extractSceneIntent } from "./sceneIntent";
import { createSceneSemanticContext } from "./sceneSemanticKb";

type DesktopInvoke = <T>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<T>;

type TauriInternals = {
  __TAURI_INTERNALS__?: {
    invoke?: DesktopInvoke;
  };
};

export type GenerateSceneDraftFromTextInput = {
  invoke?: DesktopInvoke | null;
  prompt: string;
};

export type SceneGenerationErrorKind =
  | "invalid-json"
  | "provider"
  | "schema-invalid"
  | "unavailable";

export class SceneGenerationError extends Error {
  readonly detail: string | null;
  readonly kind: SceneGenerationErrorKind;

  constructor(input: { detail?: string | null; kind: SceneGenerationErrorKind; message: string }) {
    super(input.message);
    this.name = "SceneGenerationError";
    this.detail = input.detail ?? null;
    this.kind = input.kind;
  }
}

export async function generateSceneDraftFromText(
  input: GenerateSceneDraftFromTextInput,
): Promise<SceneDraft> {
  const invoke = input.invoke === undefined ? resolveTauriInvoke() : input.invoke;

  if (!invoke) {
    const fallbackDraft = createSceneDraftFallbackFromText(input.prompt, {
      reason: "当前无法使用桌面 AI 生成功能",
    });

    if (fallbackDraft) {
      return fallbackDraft;
    }

    throw new SceneGenerationError({
      kind: "unavailable",
      message: "Desktop AI generation is unavailable. Restart the Tauri desktop shell.",
    });
  }

  const rawDraft = await invoke<unknown>("generate_scene_draft", {
    prompt: input.prompt,
    semanticContext: createProviderSemanticContext(input.prompt),
  }).catch((error: unknown) => {
    const fallbackDraft = createSceneDraftFallbackFromText(input.prompt, {
      reason: "AI 服务生成失败",
    });

    if (fallbackDraft) {
      return fallbackDraft;
    }

    throw createProviderSceneGenerationError(error);
  });

  try {
    return validateSceneDraft(readDraftCandidate(rawDraft));
  } catch (error) {
    if (error instanceof SceneGenerationError && error.kind === "invalid-json") {
      const fallbackDraft = createSceneDraftFallbackFromText(input.prompt, {
        reason: "AI 返回内容无法解析",
      });

      if (fallbackDraft) {
        return fallbackDraft;
      }
    }

    if (error instanceof SceneDraftValidationError) {
      const fallbackDraft = createSceneDraftFallbackFromText(input.prompt, {
        reason: "AI 返回场景结构不可用",
      });

      if (fallbackDraft) {
        return fallbackDraft;
      }

      throw createSceneDraftValidationGenerationError(error);
    }

    throw error;
  }
}

function createProviderSemanticContext(prompt: string): Record<string, unknown> {
  const semanticContext = createSceneSemanticContext(prompt);
  const sceneIntent = extractSceneIntent({ prompt, semanticContext });

  return {
    ...semanticContext,
    sceneIntent: {
      ...sceneIntent,
      supportedScope: {
        entities: ["ball", "block", "board", "arc-track"],
        relationships: [
          "place-on",
          "spring-between",
          "contact-spring-end",
          "connect-endpoints",
        ],
      },
    },
  };
}

function readDraftCandidate(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new SceneGenerationError({
      kind: "invalid-json",
      message:
        "Couldn't use the generated scene. The AI response was not valid JSON. Try again with one simple experiment, such as free fall or an inclined block.",
    });
  }
}

function createProviderSceneGenerationError(error: unknown): SceneGenerationError {
  const detail = redactSecretLikeValues(readRawErrorMessage(error));

  return new SceneGenerationError({
    detail,
    kind: "provider",
    message: `Couldn't generate a physics scene. Check the AI provider settings and try again. Details: ${detail}`,
  });
}

function createSceneDraftValidationGenerationError(
  error: SceneDraftValidationError,
): SceneGenerationError {
  const detail = redactSecretLikeValues(error.message);

  return new SceneGenerationError({
    detail,
    kind: "schema-invalid",
    message: `Couldn't use the generated scene. The generated scene did not match the scene schema. Try again with one simple mechanics experiment. Details: ${detail}`,
  });
}

function readRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unable to generate scene draft.";
}

function redactSecretLikeValues(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
}

function resolveTauriInvoke(): DesktopInvoke | null {
  const candidate = globalThis as TauriInternals;

  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function"
    ? candidate.__TAURI_INTERNALS__.invoke
    : null;
}
