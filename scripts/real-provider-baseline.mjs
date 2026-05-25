#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DRAFT_ARTIFACT_NAME = "physics-sandbox-real-provider-drafts.json";
const SUMMARY_ARTIFACT_NAME = "physics-sandbox-real-provider-summary.json";

export function buildRealProviderBaselinePlan(options = {}) {
  const env = options.env ?? process.env;
  const tempDir = options.tempDir ?? os.tmpdir();

  if (env.PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE !== "1") {
    throw new Error(
      "Set PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 to run the real-provider baseline.",
    );
  }

  const draftArtifactPath =
    env.PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH ??
    path.join(tempDir, DRAFT_ARTIFACT_NAME);
  const summaryArtifactPath =
    env.PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH ??
    path.join(tempDir, SUMMARY_ARTIFACT_NAME);

  return {
    draftArtifactPath,
    steps: [
      {
        args: [
          "test",
          "--manifest-path",
          "apps/desktop/src-tauri/Cargo.toml",
          "openai_real_provider_fixed_prompts_write_draft_artifact",
          "--",
          "--ignored",
        ],
        command: "cargo",
        env: {
          ...env,
          PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH: draftArtifactPath,
        },
      },
      {
        args: [
          "--filter",
          "desktop",
          "test",
          "--",
          "apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts",
        ],
        command: "pnpm",
        env: {
          ...env,
          PHYSICS_SANDBOX_REAL_PROVIDER_DRAFT_ARTIFACT_PATH: draftArtifactPath,
          PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH: summaryArtifactPath,
        },
      },
    ],
    summaryArtifactPath,
  };
}

export function runRealProviderBaseline(options = {}) {
  const plan = buildRealProviderBaselinePlan(options);
  const errorLogger = options.errorLogger ?? console.error;
  const logger = options.logger ?? console.log;
  const readFile = options.readFile ?? ((filePath) => readFileSync(filePath, "utf8"));
  const runner = options.runner ?? runStep;

  for (const step of plan.steps) {
    const status = runner(step);

    if (status !== 0) {
      return status;
    }
  }

  logger(`Draft artifact: ${plan.draftArtifactPath}`);
  logger(`Summary artifact: ${plan.summaryArtifactPath}`);

  try {
    for (const line of formatRealProviderBaselineSummaryForConsole(
      JSON.parse(readFile(plan.summaryArtifactPath)),
    )) {
      logger(line);
    }
  } catch (error) {
    errorLogger(
      `Unable to read real-provider summary artifact: ${sanitizeCliErrorMessage(error)}`,
    );
    return 1;
  }

  return 0;
}

export function formatRealProviderBaselineSummaryForConsole(artifact) {
  const summary = artifact.summary;
  const errorKindCounts = summary.errorKindCounts;

  return [
    `Summary: total=${summary.total} ok=${summary.ok} failed=${summary.failed} deterministic=${summary.deterministic} nondeterministic=${summary.nondeterministic}`,
    `Failures by kind: provider=${errorKindCounts.provider} invalid-json=${errorKindCounts["invalid-json"]} schema-invalid=${errorKindCounts["schema-invalid"]}`,
  ];
}

function sanitizeCliErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
}

function runStep(step) {
  const result = spawnSync(step.command, step.args, {
    env: step.env,
    stdio: "inherit",
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    console.error(result.error.message);
  }

  return 1;
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFilePath) {
  try {
    process.exitCode = runRealProviderBaseline();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
