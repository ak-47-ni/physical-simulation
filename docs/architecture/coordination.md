# Terminal Coordination

Use the shared coordination board to reduce A/B/C conflicts.

## Shared Board

The coordination file is stored at:

- `.coordination/terminal-status.json`

The helper resolves the path from Git's common directory, so it works from the main checkout and from worktrees.

## Commands

Initialize the board once:

```bash
pnpm coord init
```

Record planned files before editing:

```bash
pnpm coord plan A "editor-panels" \
  apps/desktop/src/panels/ObjectLibraryPanel.tsx \
  apps/desktop/src/panels/PropertyPanel.tsx \
  apps/desktop/src/panels/SceneTreePanel.tsx
```

Sync current branch, status, and modified files from `git status --short`:

```bash
pnpm coord sync A in_progress "implementing editor panels"
```

Show the full board:

```bash
pnpm coord show
```

Check for overlapping planned or modified files:

```bash
pnpm coord check
```

Clear a terminal when a task is finished:

```bash
pnpm coord clear A
```

## Recommended Workflow

1. Read `docs/architecture/ownership.md`
2. Run `pnpm coord plan <terminal> ...` before editing
3. Run `pnpm coord check`
4. Work normally
5. Run `pnpm coord sync <terminal> in_progress "task-name"` at checkpoints
6. Run `pnpm coord clear <terminal>` after the branch is handed off or merged

## Why This Is Better Than a Handwritten File

- Planned files are explicit before edits begin
- Modified files are captured from actual Git state
- Branch information is recorded automatically
- Conflicts are computed instead of guessed
- The board works across worktrees because it resolves from the shared Git common directory
