import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createRuntimeCompileRequestFromEditorState } from "../state/runtimeCompileRequest";
import { createSceneAuthoringSettings } from "../state/sceneAuthoringSettings";
import { SceneDraftValidationError, validateSceneDraft } from "./sceneDraft";
import { compileSceneDraft } from "./sceneDraftCompiler";
import {
  createSceneGenerationBaselineSummary,
  hashSceneGenerationBaselineSummary,
  type SceneGenerationBaselineSummary,
} from "./sceneGenerationBaselineSummary";

export type SceneGenerationRealProviderBaselineMetadata = {
  baseUrl?: string;
  baseUrlHost?: string;
  model: string;
  promptVersion: number;
  schemaVersion: number;
  temperature: number;
};

export type SceneGenerationRealProviderBaselineInputResult = {
  error?: unknown;
  firstDraft: unknown;
  prompt: string;
  secondError?: unknown;
  secondDraft?: unknown;
};

export type SceneGenerationRealProviderBaselineErrorKind =
  | "invalid-json"
  | "provider"
  | "schema-invalid";

export type SceneGenerationRealProviderBaselineRecord = {
  baseUrlHost: string;
  deterministic: boolean;
  error: string | null;
  errorKind: SceneGenerationRealProviderBaselineErrorKind | null;
  generatedAt: string;
  model: string;
  ok: boolean;
  prompt: string;
  promptVersion: number;
  schemaVersion: number;
  summary: SceneGenerationBaselineSummary | null;
  summaryHash: string | null;
  temperature: number;
};

export type SceneGenerationRealProviderBaselineSummary = {
  deterministic: number;
  errorKindCounts: Record<SceneGenerationRealProviderBaselineErrorKind, number>;
  failed: number;
  nondeterministic: number;
  ok: number;
  total: number;
};

export type SceneGenerationRealProviderBaselineArtifact = {
  records: SceneGenerationRealProviderBaselineRecord[];
  summary: SceneGenerationRealProviderBaselineSummary;
};

const baselineSettings = createSceneAuthoringSettings({
  gravity: 9.8,
  lengthUnit: "m",
  pixelsPerMeter: 100,
});

export function createSceneGenerationRealProviderBaselineRecords(input: {
  generatedAt: string;
  metadata: SceneGenerationRealProviderBaselineMetadata;
  results: SceneGenerationRealProviderBaselineInputResult[];
  secrets?: string[];
}): SceneGenerationRealProviderBaselineRecord[] {
  return input.results.map((result) =>
    createSceneGenerationRealProviderBaselineRecord({
      generatedAt: input.generatedAt,
      metadata: input.metadata,
      result,
      secrets: input.secrets ?? [],
    }),
  );
}

export function createSceneGenerationRealProviderBaselineRecordsFromDraftArtifact(
  artifact: {
    generatedAtUnixSeconds?: number;
    metadata: SceneGenerationRealProviderBaselineMetadata;
    results: SceneGenerationRealProviderBaselineInputResult[];
  },
): SceneGenerationRealProviderBaselineRecord[] {
  return createSceneGenerationRealProviderBaselineRecords({
    generatedAt: readGeneratedAtIsoString(artifact.generatedAtUnixSeconds),
    metadata: artifact.metadata,
    results: artifact.results,
  });
}

export function writeSceneGenerationRealProviderBaselineArtifact(
  outputPath: string,
  records: SceneGenerationRealProviderBaselineRecord[],
): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(createSceneGenerationRealProviderBaselineArtifact(records), null, 2)}\n`,
    "utf8",
  );
}

export function createSceneGenerationRealProviderBaselineArtifact(
  records: SceneGenerationRealProviderBaselineRecord[],
): SceneGenerationRealProviderBaselineArtifact {
  return {
    records,
    summary: createSceneGenerationRealProviderBaselineSummary(records),
  };
}

export function createSceneGenerationRealProviderBaselineSummary(
  records: SceneGenerationRealProviderBaselineRecord[],
): SceneGenerationRealProviderBaselineSummary {
  const summary: SceneGenerationRealProviderBaselineSummary = {
    deterministic: 0,
    errorKindCounts: {
      "invalid-json": 0,
      provider: 0,
      "schema-invalid": 0,
    },
    failed: 0,
    nondeterministic: 0,
    ok: 0,
    total: records.length,
  };

  for (const record of records) {
    if (record.ok) {
      summary.ok += 1;
      if (record.deterministic) {
        summary.deterministic += 1;
      } else {
        summary.nondeterministic += 1;
      }
      continue;
    }

    summary.failed += 1;
    if (record.errorKind) {
      summary.errorKindCounts[record.errorKind] += 1;
    }
  }

  return summary;
}

export function processSceneGenerationRealProviderDraftArtifact(
  inputPath: string,
  outputPath: string,
): SceneGenerationRealProviderBaselineRecord[] {
  const artifact = JSON.parse(readFileSync(inputPath, "utf8"));
  const records = createSceneGenerationRealProviderBaselineRecordsFromDraftArtifact(artifact);

  writeSceneGenerationRealProviderBaselineArtifact(outputPath, records);

  return records;
}

function createSceneGenerationRealProviderBaselineRecord(input: {
  generatedAt: string;
  metadata: SceneGenerationRealProviderBaselineMetadata;
  result: SceneGenerationRealProviderBaselineInputResult;
  secrets: string[];
}): SceneGenerationRealProviderBaselineRecord {
  const baseRecord = {
    baseUrlHost: readBaselineBaseUrlHost(input.metadata),
    generatedAt: input.generatedAt,
    model: input.metadata.model,
    prompt: input.result.prompt,
    promptVersion: input.metadata.promptVersion,
    schemaVersion: input.metadata.schemaVersion,
    temperature: input.metadata.temperature,
  };

  try {
    const firstSummary = createValidatedSummary(input.result.firstDraft);
    const firstSummaryHash = hashSceneGenerationBaselineSummary(firstSummary);
    const deterministic =
      input.result.secondDraft !== undefined
        ? firstSummaryHash ===
          hashSceneGenerationBaselineSummary(createValidatedSummary(input.result.secondDraft))
        : false;

    return {
      ...baseRecord,
      deterministic,
      error: readBaselineInputError(input.result, input.secrets),
      errorKind: readBaselineInputErrorKind(input.result),
      ok: true,
      summary: firstSummary,
      summaryHash: firstSummaryHash,
    };
  } catch (error) {
    return {
      ...baseRecord,
      deterministic: false,
      error: sanitizeBaselineError(
        [input.result.error, error]
          .filter((item) => item !== undefined && item !== null)
          .map(String)
          .join("; "),
        input.secrets,
      ),
      errorKind: readBaselineFailureKind(input.result, error),
      ok: false,
      summary: null,
      summaryHash: null,
    };
  }
}

function readGeneratedAtIsoString(unixSeconds: number | undefined): string {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return new Date(0).toISOString();
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function readBaselineBaseUrlHost(metadata: SceneGenerationRealProviderBaselineMetadata): string {
  if (metadata.baseUrlHost) {
    return metadata.baseUrlHost;
  }

  if (metadata.baseUrl) {
    return readBaseUrlHost(metadata.baseUrl);
  }

  return "unknown-host";
}

function readBaselineInputError(
  result: SceneGenerationRealProviderBaselineInputResult,
  secrets: string[],
): string | null {
  const errors = [result.error, result.secondError]
    .filter((item) => item !== undefined && item !== null)
    .map(String);

  if (errors.length === 0) {
    return null;
  }

  return sanitizeBaselineError(errors.join("; "), secrets);
}

function readBaselineInputErrorKind(
  result: SceneGenerationRealProviderBaselineInputResult,
): SceneGenerationRealProviderBaselineErrorKind | null {
  const errorText = [result.error, result.secondError]
    .filter((item) => item !== undefined && item !== null)
    .map(String)
    .join("; ");

  if (!errorText) {
    return null;
  }

  return readProviderArtifactErrorKind(errorText);
}

function readBaselineFailureKind(
  result: SceneGenerationRealProviderBaselineInputResult,
  error: unknown,
): SceneGenerationRealProviderBaselineErrorKind {
  const inputErrorKind = readBaselineInputErrorKind(result);

  if (inputErrorKind) {
    return inputErrorKind;
  }

  if (error instanceof SceneDraftValidationError) {
    return "schema-invalid";
  }

  return "schema-invalid";
}

function readProviderArtifactErrorKind(
  errorText: string,
): SceneGenerationRealProviderBaselineErrorKind {
  if (/non-json|invalid json|not valid json/i.test(errorText)) {
    return "invalid-json";
  }

  return "provider";
}

function createValidatedSummary(candidate: unknown): SceneGenerationBaselineSummary {
  const draft = validateSceneDraft(candidate);
  const compiled = compileSceneDraft({
    draft,
    existingConstraints: [],
    existingEntities: [],
    mode: "replace",
    settings: baselineSettings,
  });

  createRuntimeCompileRequestFromEditorState({
    constraints: compiled.constraints,
    entities: compiled.entities,
    settings: baselineSettings,
  });

  return createSceneGenerationBaselineSummary(compiled);
}

function readBaseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid-url";
  }
}

function sanitizeBaselineError(error: string, secrets: string[]): string {
  const explicitSecrets = secrets.filter((secret) => secret.length > 0);
  let sanitized = error.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");

  for (const secret of explicitSecrets) {
    sanitized = sanitized.split(secret).join("[REDACTED]");
  }

  return sanitized || "Unknown real-provider baseline error.";
}
