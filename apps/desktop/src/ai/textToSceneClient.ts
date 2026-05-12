import { validateSceneDraft, type SceneDraft } from "./sceneDraft";

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

export async function generateSceneDraftFromText(
  input: GenerateSceneDraftFromTextInput,
): Promise<SceneDraft> {
  const invoke = input.invoke === undefined ? resolveTauriInvoke() : input.invoke;

  if (!invoke) {
    throw new Error("Desktop AI generation is unavailable. Restart the Tauri desktop shell.");
  }

  const rawDraft = await invoke<unknown>("generate_scene_draft", {
    prompt: input.prompt,
  }).catch((error: unknown) => {
    throw new Error(readDesktopGenerationErrorMessage(error));
  });

  return validateSceneDraft(readDraftCandidate(rawDraft));
}

function readDraftCandidate(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("AI scene generation returned invalid JSON.");
  }
}

function readDesktopGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unable to generate scene draft.";
}

function resolveTauriInvoke(): DesktopInvoke | null {
  const candidate = globalThis as TauriInternals;

  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function"
    ? candidate.__TAURI_INTERNALS__.invoke
    : null;
}
