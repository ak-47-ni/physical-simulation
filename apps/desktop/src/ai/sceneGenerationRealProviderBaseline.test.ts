import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createSceneGenerationRealProviderBaselineArtifact,
  createSceneGenerationRealProviderBaselineRecordsFromDraftArtifact,
  createSceneGenerationRealProviderBaselineRecords,
  processSceneGenerationRealProviderDraftArtifact,
  writeSceneGenerationRealProviderBaselineArtifact,
} from "./sceneGenerationRealProviderBaseline";

const validFreeFallDraft = {
  schemaVersion: 1,
  title: "小球自由落体",
  locale: "zh-CN",
  domain: "mechanics",
  gravity: 9.8,
  entities: [
    {
      center: { x: 2.5, y: 1 },
      initialVelocity: { x: 0, y: 0 },
      kind: "ball",
      mass: 0.2,
      name: "小球",
      radius: 0.12,
    },
  ],
  relationships: [],
  analyzers: [{ kind: "trajectory", entity: "小球" }],
  assumptions: ["忽略空气阻力。"],
  warnings: [],
  unsupported: [],
};

describe("real provider scene generation baseline artifact", () => {
  it("validates generated drafts and records repeat determinism without storing secrets", () => {
    const records = createSceneGenerationRealProviderBaselineRecords({
      generatedAt: "2026-05-22T00:00:00.000Z",
      metadata: {
        baseUrl: "https://api.openai.example/v1",
        model: "gpt-test",
        promptVersion: 1,
        schemaVersion: 1,
        temperature: 0,
      },
      results: [
        {
          firstDraft: validFreeFallDraft,
          prompt: "生成一个小球自由落体实验场景",
          secondDraft: validFreeFallDraft,
        },
      ],
      secrets: ["sk-secret-value"],
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      baseUrlHost: "api.openai.example",
      deterministic: true,
      error: null,
      errorKind: null,
      model: "gpt-test",
      ok: true,
      prompt: "生成一个小球自由落体实验场景",
      promptVersion: 1,
      schemaVersion: 1,
      temperature: 0,
    });
    expect(records[0].summaryHash).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(records)).not.toContain("sk-secret-value");
  });

  it("sanitizes validation failures before writing the artifact", () => {
    const outputDir = join(
      process.cwd(),
      "node_modules",
      ".tmp",
      "real-provider-baseline-test",
    );
    const outputPath = join(outputDir, "baseline.json");

    rmSync(outputDir, { force: true, recursive: true });
    mkdirSync(outputDir, { recursive: true });

    const records = createSceneGenerationRealProviderBaselineRecords({
      generatedAt: "2026-05-22T00:00:00.000Z",
      metadata: {
        baseUrl: "https://api.openai.example/v1",
        model: "gpt-test",
        promptVersion: 1,
        schemaVersion: 1,
        temperature: 0,
      },
      results: [
        {
          error: "provider failed while using sk-secret-value",
          firstDraft: { domain: "unsupported" },
          prompt: "生成一个小球自由落体实验场景",
        },
      ],
      secrets: ["sk-secret-value"],
    });

    writeSceneGenerationRealProviderBaselineArtifact(outputPath, records);

    const contents = readFileSync(outputPath, "utf8");

    expect(records[0]).toMatchObject({
      deterministic: false,
      errorKind: "provider",
      ok: false,
      summary: null,
      summaryHash: null,
    });
    expect(contents).toContain("[REDACTED]");
    expect(contents).not.toContain("sk-secret-value");
  });

  it("classifies schema and invalid-json failures for baseline statistics", () => {
    const records = createSceneGenerationRealProviderBaselineRecords({
      generatedAt: "2026-05-22T00:00:00.000Z",
      metadata: {
        baseUrl: "https://api.openai.example/v1",
        model: "gpt-test",
        promptVersion: 1,
        schemaVersion: 1,
        temperature: 0,
      },
      results: [
        {
          firstDraft: { domain: "unsupported" },
          prompt: "生成一个小球自由落体实验场景",
        },
        {
          error: "provider returned non-JSON draft: expected value",
          firstDraft: null,
          prompt: "生成一个斜面上木块下滑的实验场景",
        },
      ],
    });

    expect(records[0]).toMatchObject({
      errorKind: "schema-invalid",
      ok: false,
      prompt: "生成一个小球自由落体实验场景",
    });
    expect(records[1]).toMatchObject({
      errorKind: "invalid-json",
      ok: false,
      prompt: "生成一个斜面上木块下滑的实验场景",
    });
  });

  it("creates aggregate statistics for real-provider baseline artifacts", () => {
    const records = createSceneGenerationRealProviderBaselineRecords({
      generatedAt: "2026-05-22T00:00:00.000Z",
      metadata: {
        baseUrl: "https://api.openai.example/v1",
        model: "gpt-test",
        promptVersion: 1,
        schemaVersion: 1,
        temperature: 0,
      },
      results: [
        {
          firstDraft: validFreeFallDraft,
          prompt: "生成一个小球自由落体实验场景",
          secondDraft: validFreeFallDraft,
        },
        {
          firstDraft: validFreeFallDraft,
          prompt: "生成一个斜面上木块下滑的实验场景",
          secondDraft: {
            ...validFreeFallDraft,
            entities: [
              {
                ...validFreeFallDraft.entities[0],
                mass: 0.3,
              },
            ],
          },
        },
        {
          firstDraft: { domain: "unsupported" },
          prompt: "生成两个小球发生弹性碰撞的场景",
        },
        {
          error: "provider returned invalid JSON",
          firstDraft: null,
          prompt: "生成一个弹簧连接小车的简谐运动场景",
        },
      ],
    });

    const artifact = createSceneGenerationRealProviderBaselineArtifact(records);

    expect(artifact.summary).toEqual({
      deterministic: 1,
      errorKindCounts: {
        "invalid-json": 1,
        provider: 0,
        "schema-invalid": 1,
      },
      failed: 2,
      nondeterministic: 1,
      ok: 2,
      total: 4,
    });
    expect(artifact.records).toEqual(records);
  });

  it("converts Rust captured draft artifacts into validation summary records", () => {
    const records = createSceneGenerationRealProviderBaselineRecordsFromDraftArtifact({
      generatedAtUnixSeconds: 1770000000,
      metadata: {
        baseUrlHost: "api.openai.example",
        model: "gpt-test",
        promptVersion: 1,
        schemaVersion: 1,
        temperature: 0,
      },
      results: [
        {
          baseUrlHost: "api.openai.example",
          error: null,
          firstDraft: validFreeFallDraft,
          model: "gpt-test",
          ok: true,
          prompt: "生成一个小球自由落体实验场景",
          promptVersion: 1,
          schemaVersion: 1,
          secondDraft: validFreeFallDraft,
          secondError: null,
          temperature: 0,
        },
      ],
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      baseUrlHost: "api.openai.example",
      deterministic: true,
      error: null,
      generatedAt: "2026-02-02T02:40:00.000Z",
      ok: true,
      prompt: "生成一个小球自由落体实验场景",
    });
    expect(records[0].summaryHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("processes captured draft artifact files into summary artifact files", () => {
    const outputDir = join(
      process.cwd(),
      "node_modules",
      ".tmp",
      "real-provider-baseline-process-test",
    );
    const inputPath = join(outputDir, "drafts.json");
    const outputPath = join(outputDir, "summary.json");

    rmSync(outputDir, { force: true, recursive: true });
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        generatedAtUnixSeconds: 1770000000,
        metadata: {
          baseUrlHost: "api.openai.example",
          model: "gpt-test",
          promptVersion: 1,
          schemaVersion: 1,
          temperature: 0,
        },
        results: [
          {
            firstDraft: validFreeFallDraft,
            prompt: "生成一个小球自由落体实验场景",
            secondDraft: validFreeFallDraft,
          },
        ],
      })}\n`,
      "utf8",
    );

    const records = processSceneGenerationRealProviderDraftArtifact(inputPath, outputPath);
    const writtenArtifact = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(records[0].ok).toBe(true);
    expect(writtenArtifact).toEqual({
      records,
      summary: {
        deterministic: 1,
        errorKindCounts: {
          "invalid-json": 0,
          provider: 0,
          "schema-invalid": 0,
        },
        failed: 0,
        nondeterministic: 0,
        ok: 1,
        total: 1,
      },
    });
  });

  it("processes configured real-provider draft artifact paths when explicitly requested", () => {
    const inputPath = process.env.PHYSICS_SANDBOX_REAL_PROVIDER_DRAFT_ARTIFACT_PATH;
    const outputPath = process.env.PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH;

    if (!inputPath || !outputPath) {
      expect(inputPath ?? outputPath).toBeUndefined();
      return;
    }

    const records = processSceneGenerationRealProviderDraftArtifact(inputPath, outputPath);

    expect(records.length).toBeGreaterThan(0);
  });
});
