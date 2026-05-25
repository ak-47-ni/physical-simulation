# Project Context

Last updated: 2026-05-22

## Repository Shape

This is a pnpm monorepo with a Rust simulation core:

- `apps/desktop`: React 19 + Vite + Tauri desktop app.
- `apps/desktop/src-tauri`: Rust Tauri command layer.
- `packages/scene-schema`: shared TypeScript scene schema and runtime contract types.
- `crates/sim-core`: Rust physics engine, scene compiler, runtime bridge, constraints, contacts, trajectory playback.
- `docs/superpowers/specs/2026-05-11-text-to-physics-scene-design.md`: earlier text-to-scene design.
- `docs/superpowers/plans/2026-05-11-text-to-physics-scene-implementation-plan.md`: earlier implementation plan.
- `docs/development/ai-scene-generation.md`: current developer workflow for AI scene generation, fallback, baseline tests, and real-provider verification.
- `docs/user/teacher-ai-scene-generation.md`: teacher-facing guide for prompt writing, draft review, fallback warnings, and classroom use.

Top-level scripts:

- `pnpm -r test`: run package tests.
- `pnpm --filter desktop test`: desktop Vitest tests.
- `pnpm --filter scene-schema test`: schema Vitest tests.
- `cargo test --manifest-path crates/sim-core/Cargo.toml`: Rust simulation core tests.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: Tauri command-layer tests.

## AI Scene Generation Path

Current text-to-scene flow:

1. UI opens `TextToSceneModal`.
2. `apps/desktop/src/App.tsx` calls `handleGenerateSceneDraft(prompt)`.
3. `handleGenerateSceneDraft` calls `generateSceneDraftFromText` from `apps/desktop/src/ai/textToSceneClient.ts`.
4. `textToSceneClient.ts` invokes the Tauri command `generate_scene_draft`.
5. `apps/desktop/src-tauri/src/main.rs` handles `generate_scene_draft`.
6. Rust reads AI configuration from process environment or `.desktop.env`.
7. Rust calls an OpenAI-compatible Responses endpoint with a strict JSON schema request.
8. Rust extracts generated text or direct draft JSON from normal JSON, chat-style JSON, or SSE-like responses.
9. Frontend parses the returned candidate and validates it with `validateSceneDraft`.
10. User applies the draft.
11. `compileSceneDraft` in `apps/desktop/src/ai/sceneDraftCompiler.ts` converts `SceneDraft` into editor entities, constraints, gravity, selected entity, and trajectory visibility.
12. Runtime compile payloads are produced through `apps/desktop/src/state/runtimeCompileRequest.ts`.
13. Tauri `compile_scene` sends the runtime request into `crates/sim-core`.

## Scene Contracts

There are two important schema layers:

- AI output contract: `apps/desktop/src/ai/sceneDraft.ts`
  - Uses `schemaVersion: 1`; legacy drafts without this field are normalized to version 1.
  - Supports `ball`, `block`, `board`, `arc-track`.
  - Supports relationships: `place-on`, `spring-between`, `contact-spring-end`, `energy-release`, `connect-endpoints`.
  - Validates mechanics-only drafts, entity references, positive mass, non-negative friction, endpoint enums, arc side enums, and implicit ground references.

- Shared scene/runtime contract: `packages/scene-schema/src/schema.ts` and `packages/scene-schema/src/runtime-contract.ts`
  - Defines persisted/editor scene documents, entities, constraints, force sources, analyzers, and dirty scopes.
  - Runtime compile request creation currently lives in desktop state code.

## Determinism Notes

Current deterministic pieces:

- `compileSceneDraft` generates local IDs from ordered draft entities and existing IDs.
- Default dimensions, placement offsets, mass, spring stiffness, and friction are constant values in `sceneDraftCompiler.ts`.
- Draft validation and compilation are local deterministic code for a given `SceneDraft`.
- OpenAI-compatible scene generation requests default `temperature` to `0`.
- `OPENAI_TEMPERATURE` can override the request temperature when explicitly configured, with accepted range `0` to `2`.
- Tauri now has a deterministic scene-generation cache key helper keyed by prompt hash, base URL hash, model, temperature, `SceneDraft` schema version, and prompt version.
- Tauri also has safe local cache file read/write helpers that reject path traversal cache keys.
- `OPENAI_SCENE_CACHE_DIR` enables opt-in generated-draft caching. It is disabled by default.
- Scene-generation cache reads ignore malformed JSON or entries whose `schemaVersion` does not match the current draft schema, and cache writes skip invalid entries.
- An ignored real-provider baseline capture test can write fixed-prompt draft artifacts without storing API keys.
- A TypeScript real-provider baseline processor validates captured drafts, compiles them, creates runtime compile requests, and records structural summary hashes with sanitized errors and `errorKind` failure categories.
- The validated real-provider summary artifact is now `{ summary, records }`, where `summary` aggregates total/ok/failed counts, deterministic/nondeterministic successful repeats, and failed counts by `errorKind`.
- The TypeScript processor can now read the Rust draft artifact format from disk and write a validated summary artifact when `PHYSICS_SANDBOX_REAL_PROVIDER_DRAFT_ARTIFACT_PATH` and `PHYSICS_SANDBOX_REAL_PROVIDER_SUMMARY_ARTIFACT_PATH` are set for `sceneGenerationRealProviderBaseline.test.ts`.
- `pnpm real-provider-baseline` runs the explicit opt-in real-provider baseline flow end to end: Rust draft capture first, then TypeScript validation/summary artifact processing. On success it prints artifact paths plus aggregate summary counts only, not prompt records or raw provider output. If the final summary artifact is unreadable, the runner exits with code `1` and a sanitized error message.
- Frontend text-to-scene errors use `SceneGenerationError` with structured `kind` values (`unavailable`, `provider`, `invalid-json`, `schema-invalid`) plus actionable messages. API-key-shaped values are redacted from details and messages.
- `App` maps `SceneGenerationError.kind` through `sceneGenerationErrorMessage.ts` and the existing i18n catalog, so AI scene-generation failures now show localized recovery guidance in the text-to-scene modal.
- `apps/desktop/src/ai/sceneDraftFallback.ts` provides a narrow deterministic local fallback for the four fixed simple baseline prompts: free fall, inclined block, elastic collision, and spring cart. It is used only when the prompt matches those categories and AI generation is unavailable, provider generation fails, provider output is invalid JSON, or provider output fails schema validation.
- Fallback drafts include a warning explaining that a local deterministic template was used. Unknown or unsupported prompts still return structured errors rather than pretending to support complex scenes.

Current determinism gaps:

- The OpenAI request body does not currently include an obvious seed, cache key, or deterministic replay control.
- The real-provider baseline runner exists, but no real provider artifact has been generated and reviewed in this workspace yet.
- There is no explicit prompt version value attached to generated drafts.

## Existing Test Coverage Around AI Generation

Relevant existing tests:

- `apps/desktop/src/ai/sceneDraft.test.ts`: validates and normalizes draft structure.
- `apps/desktop/src/ai/sceneDraftCompiler.test.ts`: compiles drafts into editor scene entities and constraints.
- `apps/desktop/src/ai/textToSceneClient.test.ts`: tests frontend Tauri invocation, structured generation error kinds, actionable generation errors, JSON parsing failures, schema validation failures, and secret redaction.
- `apps/desktop/src/ai/sceneGenerationErrorMessage.test.ts`: tests localized UI-facing recovery messages for structured text-to-scene errors.
- `apps/desktop/src/ai/sceneGenerationBaseline.test.ts`: offline fixed-prompt validation, compilation, runtime request, and summary-hash baseline.
- `apps/desktop/src/ai/sceneGenerationRealProviderBaseline.test.ts`: non-network tests for real-provider artifact processing and secret redaction.
- `apps/desktop/src/panels/TextToSceneModal.test.tsx`: tests modal behavior.
- `apps/desktop/src-tauri/src/main.rs` unit tests: cover OpenAI URL resolution, request shape, fallback behavior, response extraction, prompt requirements, and runtime trace behavior.
- `crates/sim-core/tests/*`: covers runtime compile, serialization, mechanics, constraints, collision, guide/arc-track behavior, bridge behavior, and playback.

## Sensitive Files

- `.desktop.env` may contain local API configuration or keys. Do not read it unless the user explicitly approves.

## Phase Status

- Phase 1 through Phase 5 are implemented at baseline level.
- Phase 6 documentation now has two entry points:
  - Developer workflow: `docs/development/ai-scene-generation.md`
  - Teacher guide: `docs/user/teacher-ai-scene-generation.md`
