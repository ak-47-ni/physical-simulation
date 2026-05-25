# AI Scene Generation Developer Workflow

Last updated: 2026-05-22

This document describes the current text-to-scene generation path, local configuration, fallback behavior, and repeatable verification workflow.

## Scope

The current goal is stable generation for simple middle-school mechanics scenes:

- Free fall with one ball
- Block sliding on an inclined plane
- Two balls in an elastic collision
- Spring-connected cart motion

The system does not yet claim broad support for pulleys, levers, buoyancy, electricity, or arbitrary multi-step exam problems.

## Data Flow

1. `TextToSceneModal` collects a teacher prompt.
2. `App.handleGenerateSceneDraft` calls `generateSceneDraftFromText`.
3. `generateSceneDraftFromText` invokes the Tauri command `generate_scene_draft`.
4. Rust reads AI settings from process environment or `.desktop.env`.
5. Rust calls an OpenAI-compatible Responses endpoint with a strict `SceneDraft` JSON schema.
6. The frontend parses and validates the returned candidate through `validateSceneDraft`.
7. `compileSceneDraft` converts the draft into editor entities and constraints.
8. `createRuntimeCompileRequestFromEditorState` verifies that the compiled scene can reach the runtime contract.

Important files:

- `apps/desktop/src/ai/textToSceneClient.ts`
- `apps/desktop/src/ai/sceneDraft.ts`
- `apps/desktop/src/ai/sceneDraftCompiler.ts`
- `apps/desktop/src/ai/sceneDraftFallback.ts`
- `apps/desktop/src/ai/sceneGenerationBaseline.test.ts`
- `apps/desktop/src/ai/sceneGenerationRealProviderBaseline.ts`
- `apps/desktop/src-tauri/src/main.rs`

## Local Configuration

Create `.desktop.env` at the repository root for local desktop AI generation. Do not commit credentials.

```bash
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.5
OPENAI_TEMPERATURE=0
OPENAI_SCENE_CACHE_DIR=.cache/physics-sandbox/scene-drafts
```

Notes:

- `OPENAI_TEMPERATURE` defaults to `0` to reduce output drift.
- `OPENAI_SCENE_CACHE_DIR` is optional. When set, it caches generated drafts using prompt/config/schema hashes.
- Cache files must never be treated as a secret store. They contain generated drafts, not API keys.
- `.desktop.env` may contain credentials. Read it only when explicitly needed for local AI testing.

## Schema Rules

Generated drafts must validate as `SceneDraft`:

- `schemaVersion` must be `1`.
- `domain` must be `mechanics`.
- `locale` normalizes to `zh-CN`.
- Supported entities are `ball`, `block`, `board`, and `arc-track`.
- Supported relationships are `place-on`, `spring-between`, `contact-spring-end`, `energy-release`, and `connect-endpoints`.
- Entity references must resolve.
- Mass, dimensions, spring stiffness, friction, and restitution must be physically reasonable and non-negative where applicable.

Validation errors should be surfaced as recoverable generation errors instead of silently applying invalid scenes.

## Fallback Behavior

`sceneDraftFallback.ts` provides a narrow deterministic local fallback for the four fixed simple scene categories.

Fallback is used only when both conditions are true:

- The prompt matches a known simple category.
- AI generation is unavailable, provider generation fails, provider output is invalid JSON, or provider output fails schema validation.

Fallback drafts include a warning such as:

```text
AI 服务生成失败，已使用本地确定性模板生成草稿。
```

Do not expand fallback by hardcoding one-off samples. Add a new fallback only when the scene category has:

- A stable teaching purpose
- A schema-valid template
- A deterministic structural hash
- Tests that compile the scene and create a runtime compile request
- A clear warning explaining that a local template was used

## Error Handling

Frontend generation failures use `SceneGenerationError.kind`:

- `unavailable`: desktop AI command cannot be used
- `provider`: provider request failed
- `invalid-json`: response could not be parsed as JSON
- `schema-invalid`: response failed `SceneDraft` validation

User-facing text is mapped through `sceneGenerationErrorMessage.ts` and `messages.ts`.

Secret-like values such as `sk-...` must be redacted from all displayed or persisted error messages.

## Baseline Verification

Run the offline fixed-prompt baseline:

```bash
pnpm --filter desktop test -- apps/desktop/src/ai/sceneGenerationBaseline.test.ts
```

Run fallback coverage:

```bash
pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraftFallback.test.ts
```

Run client error and fallback coverage:

```bash
pnpm --filter desktop test -- apps/desktop/src/ai/textToSceneClient.test.ts
```

Run schema package coverage:

```bash
pnpm --filter scene-schema test
```

Current fixed structural hashes:

| Prompt | Summary hash |
| --- | --- |
| `生成一个小球自由落体实验场景` | `463fa7a6` |
| `生成一个斜面上木块下滑的实验场景` | `dc18a917` |
| `生成两个小球发生弹性碰撞的场景` | `9b742227` |
| `生成一个弹簧连接小车的简谐运动场景` | `0ccaf805` |

If a hash changes, inspect whether the physical structure changed intentionally. Visual-only layout changes should not change the structural summary.

## Real Provider Baseline

The real-provider baseline is opt-in and may call an external paid API. Run it only when credentials and cost are acceptable.

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 \
pnpm real-provider-baseline
```

Optional repeat mode:

```bash
PHYSICS_SANDBOX_REAL_PROVIDER_REPEAT=1 \
PHYSICS_SANDBOX_REAL_PROVIDER_BASELINE=1 \
pnpm real-provider-baseline
```

The runner writes:

- Draft artifact: raw generated draft records and sanitized errors
- Summary artifact: `{ summary, records }`

The summary includes:

- `total`
- `ok`
- `failed`
- `deterministic`
- `nondeterministic`
- `errorKindCounts`

The runner prints only artifact paths and aggregate summary counts. It does not print API keys, raw provider output, or per-prompt records.

## Adding a New Simple Scene Category

Use this checklist before expanding support:

1. Add a representative fixed prompt to `TEST_BASELINE.md`.
2. Add a schema-valid draft fixture in `sceneGenerationBaseline.test.ts`.
3. Verify validation, compilation, runtime compile request creation, and summary hash.
4. Add or update prompt parsing rules only for the scene category, not a single sentence.
5. Add fallback only if a deterministic teaching template is defensible.
6. Add real-provider baseline expectations after local coverage is stable.
7. Update teacher documentation with capability and limitation notes.

## Troubleshooting

Provider configuration failures:

- Check `.desktop.env` or exported environment variables.
- Confirm `OPENAI_API_KEY` is present.
- Confirm `OPENAI_BASE_URL` points to a base URL or full Responses endpoint.
- Keep `OPENAI_TEMPERATURE=0` for deterministic tests.

Invalid generated JSON:

- Keep strict schema response format enabled in Rust.
- Inspect sanitized provider artifact output.
- Check whether the provider supports the requested Responses API behavior.

Schema-invalid output:

- Inspect the validation detail.
- Prefer improving prompt/schema guidance or draft post-processing.
- Use fallback only for supported fixed simple categories.

Nondeterministic real-provider output:

- Check `OPENAI_TEMPERATURE`.
- Enable `PHYSICS_SANDBOX_REAL_PROVIDER_REPEAT=1`.
- Compare summary hashes.
- Consider enabling `OPENAI_SCENE_CACHE_DIR` for repeatable local replay.
