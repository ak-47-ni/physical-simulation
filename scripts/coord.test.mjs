import { describe, expect, it } from "vitest";

import {
  buildBoardPathFromCommonDir,
  createEmptyBoard,
  detectConflicts,
  parseGitStatus,
  upsertTerminalEntry,
} from "./coord.mjs";

describe("coordination helpers", () => {
  it("parses modified and untracked files from git status output", () => {
    const files = parseGitStatus(` M apps/desktop/src/App.tsx
?? apps/desktop/src/panels/ObjectLibraryPanel.tsx
M  packages/scene-schema/src/schema.ts
`);

    expect(files).toEqual([
      "apps/desktop/src/App.tsx",
      "apps/desktop/src/panels/ObjectLibraryPanel.tsx",
      "packages/scene-schema/src/schema.ts",
    ]);
  });

  it("updates a terminal entry and preserves normalized file sets", () => {
    const board = createEmptyBoard();

    const updated = upsertTerminalEntry(board, {
      branch: "feat/desktop-editor-shell",
      modifiedFiles: ["apps/desktop/src/App.tsx", "apps/desktop/src/App.tsx"],
      plannedFiles: ["apps/desktop/src/panels/ObjectLibraryPanel.tsx"],
      status: "in_progress",
      task: "Editor panels",
      terminal: "A",
    });

    expect(updated.terminals.A).toMatchObject({
      branch: "feat/desktop-editor-shell",
      modifiedFiles: ["apps/desktop/src/App.tsx"],
      plannedFiles: ["apps/desktop/src/panels/ObjectLibraryPanel.tsx"],
      status: "in_progress",
      task: "Editor panels",
      terminal: "A",
    });
  });

  it("detects overlaps across planned and modified files", () => {
    const board = upsertTerminalEntry(
      upsertTerminalEntry(createEmptyBoard(), {
        modifiedFiles: ["apps/desktop/src/App.tsx"],
        plannedFiles: ["apps/desktop/src/panels/ObjectLibraryPanel.tsx"],
        status: "in_progress",
        task: "Desktop shell",
        terminal: "A",
      }),
      {
        modifiedFiles: ["apps/desktop/src/panels/ObjectLibraryPanel.tsx"],
        plannedFiles: ["crates/sim-core/src/lib.rs"],
        status: "in_progress",
        task: "Runtime bridge",
        terminal: "C",
      },
    );

    expect(detectConflicts(board)).toEqual([
      {
        file: "apps/desktop/src/panels/ObjectLibraryPanel.tsx",
        terminals: ["A", "C"],
      },
    ]);
  });

  it("builds the shared board path from the common git dir", () => {
    expect(
      buildBoardPathFromCommonDir("/Users/ljs/physics-sandbox/.git"),
    ).toBe("/Users/ljs/physics-sandbox/.coordination/terminal-status.json");
  });
});
