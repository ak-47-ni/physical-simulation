# Shared Contracts

## Baseline Verification Commands

```bash
pnpm install
pnpm --filter desktop test
pnpm --filter scene-schema test
cargo test --manifest-path crates/sim-core/Cargo.toml
```

## Scene Schema Ownership

- Source of truth: `packages/scene-schema/src/schema.ts`
- Public exports: `packages/scene-schema/src/index.ts`
- Shared contract changes require coordination before merge

## Runtime Contract Ownership

- Compile request and runtime frame payload source of truth: `packages/scene-schema/src/runtime-contract.ts`
- UI and solver must depend on this package instead of redefining payloads locally

## Runtime Rebuild Rules

- `analysis` and `annotation` edits do not require solver rebuild
- `physics` and `structure` edits require solver rebuild before resume

## Contract Freeze for M2

The following are frozen for worker parallelization:

- Scene schema version constant
- Top-level scene document collections
- Convex-only user polygon rule for v1
- Runtime frame payload shape with stable entity IDs and transforms
- `SceneConstraint` is a tagged union:
  - `spring`: `{ id, kind, entityAId, entityBId, restLength, stiffness }`
  - `track`: `{ id, kind, entityId, origin, axis }`
- `ForceSource` is explicit for M2:
  - `gravity`: `{ id, kind, acceleration }`
- Runtime compile requests must consume these exported contract types instead of redefining
- `DirtyEditScope` remains unchanged for M2
