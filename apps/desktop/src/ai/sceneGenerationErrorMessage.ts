import type { MessageKey } from "../i18n";
import { SceneGenerationError } from "./textToSceneClient";

type Translate = (key: MessageKey) => string;

export function readSceneGenerationUserMessage(error: unknown, t: Translate): string {
  if (error instanceof SceneGenerationError) {
    const baseMessage = readSceneGenerationBaseMessage(error, t);

    if (!error.detail) {
      return baseMessage;
    }

    return `${baseMessage} ${t("aiScene.error.details")} ${error.detail}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t("aiScene.error.unknown");
}

function readSceneGenerationBaseMessage(error: SceneGenerationError, t: Translate): string {
  switch (error.kind) {
    case "invalid-json":
      return t("aiScene.error.invalidJson");
    case "provider":
      return t("aiScene.error.provider");
    case "schema-invalid":
      return t("aiScene.error.schemaInvalid");
    case "unavailable":
      return t("aiScene.error.unavailable");
  }
}
