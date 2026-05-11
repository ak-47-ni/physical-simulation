# Text To Physics Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-phase OpenAI-powered text-to-mechanics-scene workflow for Chinese exam-style prompts.

**Architecture:** OpenAI calls run through Tauri/Rust so the API key stays out of frontend code. The model returns strict `SceneDraft` JSON, frontend TypeScript validates and compiles it into existing editor entities/constraints, and the user previews the AI understanding before replacing or inserting the scene.

**Tech Stack:** React 19, Vitest, Tauri 2, Rust `reqwest`, OpenAI Responses API, existing editor scene state.

---

## File Map

- Create `apps/desktop/src/ai/sceneDraft.ts`: TypeScript `SceneDraft` types, runtime validation, normalization, warnings.
- Create `apps/desktop/src/ai/sceneDraftCompiler.ts`: deterministic conversion from `SceneDraft` to editor entities, constraints, gravity, trajectory IDs.
- Create `apps/desktop/src/ai/textToSceneClient.ts`: frontend invoke wrapper for the Tauri command.
- Create `apps/desktop/src/panels/TextToSceneModal.tsx`: prompt input, loading/error state, draft preview, replace/insert actions.
- Modify `apps/desktop/src/App.tsx`: open modal, call client, apply compiled scene, reset stale playback.
- Modify `apps/desktop/src/i18n/messages.ts`: AI scene generation copy.
- Modify `apps/desktop/src/app-meta.ts`: bump desktop version.
- Modify `apps/desktop/src-tauri/Cargo.toml`: add HTTP dependencies.
- Modify `apps/desktop/src-tauri/src/main.rs`: add OpenAI request command and tests for missing config/error parsing where practical.

## Task 1: SceneDraft Validation

**Files:**
- Create: `apps/desktop/src/ai/sceneDraft.ts`
- Test: `apps/desktop/src/ai/sceneDraft.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- Valid rough-board block prompt draft normalizes successfully.
- Unsupported non-mechanics domain is rejected.
- Negative mass and friction produce errors or warnings.
- Unknown relationship references are rejected.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraft.test.ts`

- [ ] **Step 3: Implement validator**

Implement `validateSceneDraft(candidate: unknown): ValidatedSceneDraft`.

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraft.test.ts`

## Task 2: Draft-To-Editor Compiler

**Files:**
- Create: `apps/desktop/src/ai/sceneDraftCompiler.ts`
- Test: `apps/desktop/src/ai/sceneDraftCompiler.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- Creates locked board and block placed on board with velocity.
- Defaults gravity to current app settings when omitted.
- Creates spring constraints between two named bodies.
- Insert mode offsets generated IDs and keeps existing entities.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraftCompiler.test.ts`

- [ ] **Step 3: Implement compiler**

Use SI authoring units and existing editor entity shapes.

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter desktop test -- apps/desktop/src/ai/sceneDraftCompiler.test.ts`

## Task 3: Tauri OpenAI Command

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src/ai/textToSceneClient.ts`
- Test: `apps/desktop/src/ai/textToSceneClient.test.ts`

- [ ] **Step 1: Write frontend invoke tests**

Cover:
- Sends prompt to `generate_scene_draft`.
- Surfaces missing desktop command errors.

- [ ] **Step 2: Add Rust HTTP dependencies**

Add `reqwest`, `serde`, and related features if needed.

- [ ] **Step 3: Implement command**

Read `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` with default `gpt-5.4-mini`, call Responses API, request strict JSON schema, return raw JSON string or structured error.

- [ ] **Step 4: Register command**

Add to `tauri::generate_handler!`.

- [ ] **Step 5: Run targeted tests/build**

Run frontend client tests and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.

## Task 4: Modal UI And App Integration

**Files:**
- Create: `apps/desktop/src/panels/TextToSceneModal.tsx`
- Test: `apps/desktop/src/panels/TextToSceneModal.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Test: `apps/desktop/src/App.test.tsx`

- [ ] **Step 1: Write modal tests**

Cover:
- Prompt text area and generate button.
- Loading state.
- Shows entities, assumptions, warnings.
- Calls replace/insert handlers only after a validated draft exists.

- [ ] **Step 2: Implement modal**

Keep it self-contained and not coupled to editor state.

- [ ] **Step 3: Write App integration tests**

Cover:
- AI Generate Scene button opens modal.
- Mock generated draft can replace current scene.

- [ ] **Step 4: Implement App wiring**

Add `AI Generate Scene` button near file actions, state for modal, draft generation, compile/apply.

## Task 5: Copy, Version, Verification

**Files:**
- Modify: `apps/desktop/src/i18n/messages.ts`
- Modify: `apps/desktop/src/app-meta.ts`
- Modify docs if needed.

- [ ] **Step 1: Add English and Chinese strings**

Cover button labels, modal labels, warnings, and error messages.

- [ ] **Step 2: Bump version**

Increment from `1.0.38` to `1.0.39`.

- [ ] **Step 3: Run verification**

Run:
- `pnpm --filter desktop test`
- `pnpm --filter desktop build`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 4: Report status**

Summarize changed files, verified commands, and any remaining manual setup such as `OPENAI_API_KEY`.
