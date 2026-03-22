# Parallel Ownership

## Worker A

Owns:

- `apps/desktop/src/layout/**`
- `apps/desktop/src/workspace/**`
- `apps/desktop/src/panels/ObjectLibraryPanel.tsx`
- `apps/desktop/src/panels/PropertyPanel.tsx`
- `apps/desktop/src/panels/SceneTreePanel.tsx`
- `apps/desktop/src/io/**`
- `apps/desktop/src/state/editorStore.ts`

## Worker B

Owns:

- `crates/sim-core/**`
- Rust-side Tauri command registration

## Worker C

Owns:

- `apps/desktop/src/annotation/**`
- `apps/desktop/src/analysis/**`
- `apps/desktop/src/panels/BottomTransportBar.tsx`
- `apps/desktop/src/state/runtimeBridge.ts`

## Coordination Rule

- Shared contract changes in `packages/scene-schema/**` require controller approval before merge.
- Worker branches are opened only after the scene schema and runtime contract are committed.
