import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  buildBoardPathFromCommonDir,
  createEmptyBoard,
  detectConflicts,
  loadBoard,
  parseGitStatus,
  upsertTerminalEntry,
} from "./coord.mjs";

const execFileAsync = promisify(execFile);
const coordModuleUrl = new URL("./coord.mjs", import.meta.url).href;

async function runConcurrentBoardUpdate(boardPath, terminal, delayAfterLoadMs = 0) {
  const code = `
    const { updateBoardFile, upsertTerminalEntry } = await import(${JSON.stringify(coordModuleUrl)});
    updateBoardFile(
      ${JSON.stringify(boardPath)},
      (board) =>
        upsertTerminalEntry(board, {
          branch: ${JSON.stringify(`feat/${terminal.toLowerCase()}`)},
          modifiedFiles: [],
          plannedFiles: [],
          status: "in_progress",
          task: ${JSON.stringify(`task ${terminal}`)},
          terminal: ${JSON.stringify(terminal)},
        }),
      { delayAfterLoadMs: ${delayAfterLoadMs} },
    );
  `;

  await execFileAsync("node", ["--input-type=module", "-e", code]);
}

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

  it("serializes concurrent board updates without dropping entries", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coord-board-"));
    const boardPath = path.join(tempDir, "terminal-status.json");

    const firstUpdate = runConcurrentBoardUpdate(boardPath, "A", 150);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const secondUpdate = runConcurrentBoardUpdate(boardPath, "B");

    await Promise.all([firstUpdate, secondUpdate]);

    const board = loadBoard(boardPath);

    expect(Object.keys(board.terminals).sort()).toEqual(["A", "B"]);
    expect(board.terminals.A.task).toBe("task A");
    expect(board.terminals.B.task).toBe("task B");
  });
});
