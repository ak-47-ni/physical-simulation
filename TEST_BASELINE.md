# Test Baseline: AI Physics Scene Generation

Last updated: 2026-05-22

## Fixed Prompt Set

These prompts are the initial repeatable baseline for simple classroom mechanics scenes:

1. `生成一个小球自由落体实验场景`
2. `生成一个斜面上木块下滑的实验场景`
3. `生成两个小球发生弹性碰撞的场景`
4. `生成一个弹簧连接小车的简谐运动场景`

Future baseline prompts should be added only when the expected scene structure can be checked without depending on a single hardcoded model phrasing.

## Required Checks Per Prompt

Each prompt should verify:

- Generation succeeds or returns a clear recoverable error.
- Output conforms to `SceneDraft`.
- Object types are appropriate for the prompt.
- Physical parameters are reasonable for a middle-school classroom scene.
- Key constraints or relationships exist.
- Repeated generation with the same prompt, model config, seed, and project version is structurally identical.
- The compiled editor scene can be converted into a runtime compile request.
- The runtime can compile the scene without error.

## Current Local Baseline Status

A dedicated offline fixed-prompt baseline now exists:

- `apps/desktop/src/ai/sceneGenerationBaseline.test.ts`

Documentation entry points:

- `docs/development/ai-scene-generation.md`
- `docs/user/teacher-ai-scene-generation.md`

The baseline uses representative `SceneDraft` fixtures for the fixed prompts. It does not call a real model or external API.

For each fixed prompt, the baseline currently checks:

- `SceneDraft` validation succeeds.
- Drafts normalize to `schemaVersion: 1`.
- The domain and locale are constrained to mechanics / `zh-CN`.
- Expected object kinds and key parameters exist.
- Expected relationships or constraints exist.
- The draft compiles into editor entities and constraints.
- The compiled scene converts into a runtime compile request with gravity.
- Repeating local validation and compilation produces the same structural result.
- The compiled scene can be reduced to a stable physics-structure summary.
- The summary can be hashed with a deterministic local hash for future drift comparison.

Current summary/hash helper:

- `apps/desktop/src/ai/sceneGenerationBaselineSummary.ts`
- `apps/desktop/src/ai/sceneGenerationBaselineSummary.test.ts`

Deterministic local fallback:

- `apps/desktop/src/ai/sceneDraftFallback.ts` contains the narrow local fallback for the four fixed simple prompt categories.
- `apps/desktop/src/ai/sceneDraftFallback.test.ts` verifies that each fallback draft validates, compiles, converts into a runtime compile request, and hashes to the same structural summary as the offline baseline.
- `generateSceneDraftFromText` uses this fallback only when the prompt matches the fixed simple categories and the desktop provider is unavailable, fails, returns invalid JSON, or returns schema-invalid data.
- Unsupported prompts still return structured recoverable errors.

Artifact output:

- Set `PHYSICS_SANDBOX_BASELINE_ARTIFACT_PATH=/path/to/baseline.json` when running `apps/desktop/src/ai/sceneGenerationBaseline.test.ts`.
- The artifact is a JSON array of prompt, summary, and summaryHash records.
- The artifact contains no API key, provider URL, raw prompt response, or teacher account data.
- By default, no artifact file is written.

Real-provider draft capture:

- Preferred one-command flow:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 \
pnpm real-provider-baseline
```

- Default artifacts are written under the OS temp directory:
  - `physics-sandbox-real-provider-drafts.json`
  - `physics-sandbox-real-provider-summary.json`
- Override artifact paths with:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH=/tmp/physics-sandbox-real-provider-drafts.json
PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH=/tmp/physics-sandbox-real-provider-summary.json
```

- Internally, the runner first uses an ignored, opt-in Rust draft capture test that reuses the app's OpenAI-compatible request path:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 \
PHYSICS_SANDBOX_REAL_PROVIDER_ARTIFACT_PATH=/tmp/physics-sandbox-real-provider-drafts.json \
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  openai_real_provider_fixed_prompts_write_draft_artifact -- --ignored --nocapture
```

- Optional repeat mode:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_REPEAT=1
```

- Optional cache mode:

```bash
OPENAI_SCENE_CACHE_DIR=.cache/physics-sandbox/scene-drafts
```

- The real-provider artifact stores the fixed prompt, model, base URL host only, prompt/schema versions, temperature, generated draft JSON, and sanitized errors.
- It does not store the API key.
- `apps/desktop/src/ai/sceneGenerationRealProviderBaseline.ts` converts provider drafts into validation/runtime-check records with structural summaries and summary hashes.
- The validated real-provider summary artifact is written as `{ summary, records }`:
  - `summary.total`, `summary.ok`, and `summary.failed` give run-level pass/fail counts.
  - `summary.deterministic` and `summary.nondeterministic` count successful prompts whose repeated structural summaries matched or drifted.
  - `summary.errorKindCounts` aggregates failed prompts by `provider`, `invalid-json`, and `schema-invalid`.
- After a successful `pnpm real-provider-baseline` run, the script prints only the artifact paths and aggregate `summary` counts. It does not print per-prompt records or raw provider output.
- If the summary artifact cannot be read or parsed after the provider steps finish, the runner returns exit code `1` with a sanitized recovery error instead of throwing an uncaught exception.
- To manually convert a captured draft artifact into validated structural summary records:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_DRAFT_ARTIFACT_PATH=/tmp/physics-sandbox-real-provider-drafts.json \
PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH=/tmp/physics-sandbox-real-provider-summary.json \
pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts
```

Current fixed prompt summary hashes:

| Prompt | Summary hash |
| --- | --- |
| `生成一个小球自由落体实验场景` | `463fa7a6` |
| `生成一个斜面上木块下滑的实验场景` | `dc18a917` |
| `生成两个小球发生弹性碰撞的场景` | `9b742227` |
| `生成一个弹簧连接小车的简谐运动场景` | `0ccaf805` |

Existing related coverage is unit-level and mock/local-data based:

- `sceneDraft.test.ts` validates individual draft examples and bad data.
- `sceneDraftCompiler.test.ts` verifies deterministic compilation for selected draft examples.
- `textToSceneClient.test.ts` verifies frontend command invocation and JSON parsing.
- Tauri unit tests verify request construction and response extraction.
- Rust `sim-core` tests verify runtime compile and physics behavior for many hand-authored scenes.

## Verification Log

### 2026-05-22

Commands run:

- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaseline.test.ts`
  - Result: passed.
  - Observed scope after artifact-output test was added: Vitest ran the full desktop suite, 66 files and 477 tests passed.
  - Notes: The new baseline test file itself contributed 8 tests for 4 fixed prompts.
- Hash red/green note: pending expected hashes failed with actual values `463fa7a6`, `dc18a917`, `9b742227`, and `0ccaf805`; after pinning those hashes, the baseline passed.
- `PHYSICS_SANDBOX_BASELINE_ARTIFACT_PATH=/tmp/physics-sandbox-scene-baseline.json pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaseline.test.ts`
  - Result: passed.
  - Observed scope: Vitest ran the full desktop suite, 66 files and 477 tests passed.
  - The temporary artifact was inspected and then removed from `/tmp`.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaselineSummary.test.ts`
  - Result: failed first because `sceneGenerationBaselineSummary` did not exist, then passed after implementation.
  - Observed passing scope: Vitest ran the full desktop suite, 66 files and 476 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaseline.test.ts apps/desktop/src/ai/sceneGenerationBaselineSummary.test.ts`
  - Result: passed.
  - Observed scope: Vitest ran the full desktop suite, 66 files and 476 tests passed.

- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraft.test.ts apps/desktop/src/ai/sceneDraftCompiler.test.ts apps/desktop/src/ai/textToSceneClient.test.ts apps/desktop/src/panels/TextToSceneModal.test.tsx`
  - Result: passed.
  - Observed scope: Vitest ran the full desktop suite, 64 files and 466 tests passed.
- `pnpm --filter scene-schema test`
  - Result: passed, 1 file and 19 tests.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml openai -- --nocapture`
  - Result: passed, 13 OpenAI request/response-related tests after adding `OPENAI_TEMPERATURE` and `OPENAI_SCENE_CACHE_DIR` coverage.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaseline.test.ts apps/desktop/src/ai/sceneGenerationBaselineSummary.test.ts apps/desktop/src/ai/textToSceneClient.test.ts`
  - Result: passed.
  - Observed scope: Vitest ran the full desktop suite, 66 files and 477 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraft.test.ts apps/desktop/src/ai/sceneGenerationBaseline.test.ts apps/desktop/src/ai/sceneGenerationBaselineSummary.test.ts apps/desktop/src/ai/sceneDraftCompiler.test.ts apps/desktop/src/ai/textToSceneClient.test.ts`
  - Result: passed after adding `SceneDraft.schemaVersion`.
  - Observed scope: Vitest ran the full desktop suite, 66 files and 478 tests passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml scene_draft_json_schema -- --nocapture`
  - Result: passed, 1 strict schema test.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml scene_generation_cache -- --nocapture`
  - Result: passed, 2 cache-key/cache-file interface tests.
- `pnpm --filter scene-schema test`
  - Result: passed, 1 file and 19 tests.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts`
  - Result: failed first because `sceneGenerationRealProviderBaseline` did not exist, then passed after implementation.
  - Observed passing scope: Vitest ran the full desktop suite, 67 files and 480 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts`
  - Result: passed after adding Rust draft artifact conversion and file-level summary artifact processing.
  - Observed scope: Vitest ran the full desktop suite, 67 files and 483 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts`
  - Result: failed first because real-provider summary records did not include `errorKind`, then passed after adding `provider`, `invalid-json`, and `schema-invalid` failure categories.
  - Observed scope: Vitest ran the full desktop suite, 68 files and 490 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts`
  - Result: failed first because real-provider summary artifacts did not include aggregate statistics, then passed after adding `{ summary, records }` artifact output.
  - Observed scope: Vitest ran the full desktop suite, 68 files and 491 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/textToSceneClient.test.ts`
  - Result: failed first on raw provider errors, invalid JSON errors, schema validation errors, and API-key-shaped secret redaction; passed after adding actionable error normalization.
  - Observed passing scope: Vitest ran the full desktop suite, 67 files and 486 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/textToSceneClient.test.ts`
  - Result: failed first because `SceneGenerationError` did not exist, then passed after adding structured error kinds (`unavailable`, `provider`, `invalid-json`, `schema-invalid`).
  - Observed passing scope: Vitest ran the full desktop suite, 67 files and 486 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationErrorMessage.test.ts`
  - Result: failed first because `sceneGenerationErrorMessage` did not exist, then passed after adding localized UI error mapping.
  - Observed passing scope: Vitest ran the full desktop suite, 68 files and 489 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationErrorMessage.test.ts apps/desktop/src/ai/textToSceneClient.test.ts apps/desktop/src/i18n/desktopLanguageSwitch.test.tsx`
  - Result: passed after wiring `App` to the localized text-to-scene error message mapper.
  - Observed scope: Vitest ran the full desktop suite, 68 files and 489 tests passed.
- `pnpm exec vitest run scripts/real-provider-baseline.test.mjs`
  - Result: failed first because `scripts/real-provider-baseline.mjs` did not exist, then passed after adding the one-command runner.
  - Observed scope: 1 file and 3 tests passed.
- `pnpm test:real-provider-baseline`
  - Result: passed, 1 file and 3 tests.
- `pnpm real-provider-baseline`
  - Result: failed as expected without `PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1`; no real provider call was made.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml real_provider_baseline_artifact_metadata_uses_safe_host_and_fixed_prompts -- --nocapture`
  - Result: passed, 1 real-provider artifact metadata/unit test.
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`
  - Result: passed after formatting the new ignored real-provider test.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml openai -- --nocapture`
  - Result: passed, 13 tests and 1 ignored real-provider test.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml scene_generation_cache -- --nocapture`
  - Result: passed, 4 cache tests after adding invalid-cache recovery coverage.
- `pnpm --filter scene-schema test`
  - Result: passed, 1 file and 19 tests.
- `pnpm exec vitest run scripts/real-provider-baseline.test.mjs`
  - Result: failed first because the runner did not format or print aggregate summary counts, then passed after adding non-sensitive console summary output.
  - Observed scope: 1 file and 5 tests passed.
- `pnpm exec vitest run scripts/real-provider-baseline.test.mjs`
  - Result: failed first because unreadable summary artifacts threw uncaught errors, then passed after returning exit code `1` with sanitized error output.
  - Observed scope: 1 file and 6 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraftFallback.test.ts`
  - Result: failed first because `sceneDraftFallback` did not exist, then passed after adding deterministic fallback templates for the four fixed simple prompt categories.
  - Observed passing scope: Vitest ran the full desktop suite, 69 files and 496 tests passed.
- `pnpm --filter desktop test -- apps/desktop/src/ai/textToSceneClient.test.ts apps/desktop/src/ai/sceneDraftFallback.test.ts`
  - Result: failed first because the client did not use fallback drafts for unavailable/provider/invalid-json/schema-invalid failures, then passed after wiring the fallback into supported prompt failure paths.
  - Observed passing scope: Vitest ran the full desktop suite, 69 files and 500 tests passed.

No real OpenAI-compatible API call was made during this verification.

## Known Baseline Gaps

- No committed real-provider golden snapshots for the four fixed natural-language prompts.
- No model-output repeatability check.
- No seed/config capture in generation requests.
- No prompt-version metadata in `SceneDraft`.
- The real-provider baseline has a single command runner, but no real-provider artifact has been generated and reviewed in this workspace yet.
- No real-provider saved result artifact for comparing future AI generation changes.
- Real-provider caching is opt-in through `OPENAI_SCENE_CACHE_DIR`; no repeated real-provider cache-hit acceptance test exists yet.
- The current summary hash is a local deterministic comparison key, not a cryptographic security primitive.

## Suggested Minimal Harness

Add a lightweight script or Vitest suite that uses fixture drafts first, then optional real-provider mode later:

- Offline mode:
  - Map fixed prompts to representative `SceneDraft` fixture JSON.
  - Validate each fixture with `validateSceneDraft`.
  - Compile with `compileSceneDraft`.
  - Convert to runtime compile request with `createRuntimeCompileRequestFromEditorState`.
  - Assert expected object kinds, relationships, constraints, and key parameters.

- Optional provider mode:
  - Requires explicit user approval before reading `.desktop.env` or using real API keys.
  - Captures prompt, model, base URL domain only, seed/config, project commit, generated draft hash, normalized structural hash, and validation result.
  - Stores non-secret results in a local baseline artifact.
