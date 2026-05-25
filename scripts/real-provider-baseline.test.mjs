import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRealProviderBaselinePlan,
  formatRealProviderBaselineSummaryForConsole,
  runRealProviderBaseline,
} from "./real-provider-baseline.mjs";

describe("real provider baseline script", () => {
  it("requires an explicit real-provider opt-in before building commands", () => {
    expect(() =>
      buildRealProviderBaselinePlan({
        env: {},
        tempDir: "/tmp",
      }),
    ).toThrow(/PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1/);
  });

  it("builds safe default artifact paths and command arguments", () => {
    const plan = buildRealProviderBaselinePlan({
      env: {
        PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE: "1",
      },
      tempDir: "/tmp",
    });

    expect(plan.draftArtifactPath).toBe(
      path.join("/tmp", "physics-sandbox-real-provider-drafts.json"),
    );
    expect(plan.summaryArtifactPath).toBe(
      path.join("/tmp", "physics-sandbox-real-provider-summary.json"),
    );
    expect(plan.steps).toEqual([
      expect.objectContaining({
        command: "cargo",
        args: [
          "test",
          "--manifest-path",
          "apps/desktop/src-tauri/Cargo.toml",
          "openai_real_provider_fixed_prompts_write_draft_artifact",
          "--",
          "--ignored",
        ],
      }),
      expect.objectContaining({
        command: "pnpm",
        args: [
          "--filter",
          "desktop",
          "test",
          "--",
          "apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts",
        ],
      }),
    ]);
    expect(plan.steps[0].env.PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH).toBe(
      plan.draftArtifactPath,
    );
    expect(plan.steps[1].env.PHYSICS_SANDBOX_REAL_PROVIDER_DRAFT_ARTIFACT_PATH).toBe(
      plan.draftArtifactPath,
    );
    expect(plan.steps[1].env.PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH).toBe(
      plan.summaryArtifactPath,
    );
  });

  it("uses caller-provided artifact paths and stops after the first failed command", () => {
    const calls = [];
    const status = runRealProviderBaseline({
      env: {
        PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE: "1",
        PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH: "/safe/drafts.json",
        PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH: "/safe/summary.json",
      },
      runner: (step) => {
        calls.push(step);
        return calls.length === 1 ? 17 : 0;
      },
      tempDir: "/tmp",
    });

    expect(status).toBe(17);
    expect(calls).toHaveLength(1);
    expect(calls[0].env.PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH).toBe("/safe/drafts.json");
  });

  it("formats aggregate summary counts without record details", () => {
    expect(
      formatRealProviderBaselineSummaryForConsole({
        records: [{ prompt: "生成一个小球自由落体实验场景", error: "sk-secret-value" }],
        summary: {
          deterministic: 2,
          errorKindCounts: {
            "invalid-json": 1,
            provider: 0,
            "schema-invalid": 1,
          },
          failed: 2,
          nondeterministic: 1,
          ok: 3,
          total: 5,
        },
      }),
    ).toEqual([
      "Summary: total=5 ok=3 failed=2 deterministic=2 nondeterministic=1",
      "Failures by kind: provider=0 invalid-json=1 schema-invalid=1",
    ]);
  });

  it("prints aggregate summary after successful baseline commands", () => {
    const logs = [];
    const status = runRealProviderBaseline({
      env: {
        PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE: "1",
        PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH: "/safe/drafts.json",
        PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH: "/safe/summary.json",
      },
      logger: (line) => logs.push(line),
      readFile: (filePath) => {
        expect(filePath).toBe("/safe/summary.json");
        return JSON.stringify({
          records: [{ prompt: "生成一个小球自由落体实验场景", error: "sk-secret-value" }],
          summary: {
            deterministic: 1,
            errorKindCounts: {
              "invalid-json": 0,
              provider: 1,
              "schema-invalid": 0,
            },
            failed: 1,
            nondeterministic: 0,
            ok: 1,
            total: 2,
          },
        });
      },
      runner: () => 0,
      tempDir: "/tmp",
    });

    expect(status).toBe(0);
    expect(logs).toEqual([
      "Draft artifact: /safe/drafts.json",
      "Summary artifact: /safe/summary.json",
      "Summary: total=2 ok=1 failed=1 deterministic=1 nondeterministic=0",
      "Failures by kind: provider=1 invalid-json=0 schema-invalid=0",
    ]);
    expect(logs.join("\n")).not.toContain("sk-secret-value");
  });

  it("returns a clear sanitized failure when the summary artifact cannot be read", () => {
    const errors = [];
    const status = runRealProviderBaseline({
      env: {
        PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE: "1",
        PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH: "/safe/drafts.json",
        PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH: "/safe/summary.json",
      },
      errorLogger: (line) => errors.push(line),
      logger: () => undefined,
      readFile: () => {
        throw new Error("missing summary for sk-secret-value");
      },
      runner: () => 0,
      tempDir: "/tmp",
    });

    expect(status).toBe(1);
    expect(errors).toEqual([
      "Unable to read real-provider summary artifact: missing summary for [REDACTED]",
    ]);
  });
});
