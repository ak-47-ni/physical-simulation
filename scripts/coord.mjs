import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BOARD_VERSION = 1;

export function createEmptyBoard() {
  return {
    version: BOARD_VERSION,
    updatedAt: null,
    terminals: {},
  };
}

export function parseGitStatus(output) {
  return output
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map(normalizeFilePath);
}

export function buildBoardPathFromCommonDir(commonDir) {
  const projectRoot =
    path.basename(commonDir) === ".git" ? path.dirname(commonDir) : commonDir;

  return path.join(projectRoot, ".coordination", "terminal-status.json");
}

export function upsertTerminalEntry(board, entry) {
  const terminal = entry.terminal;
  const current = board.terminals[terminal] ?? {
    branch: "",
    modifiedFiles: [],
    plannedFiles: [],
    status: "idle",
    task: "",
    terminal,
    updatedAt: null,
  };

  const nextEntry = {
    ...current,
    ...entry,
    modifiedFiles: normalizeFileSet(entry.modifiedFiles ?? current.modifiedFiles),
    plannedFiles: normalizeFileSet(entry.plannedFiles ?? current.plannedFiles),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...board,
    updatedAt: nextEntry.updatedAt,
    terminals: {
      ...board.terminals,
      [terminal]: nextEntry,
    },
  };
}

export function clearTerminal(board, terminal) {
  const nextTerminals = { ...board.terminals };
  delete nextTerminals[terminal];

  return {
    ...board,
    terminals: nextTerminals,
    updatedAt: new Date().toISOString(),
  };
}

export function detectConflicts(board) {
  const byFile = new Map();

  for (const [terminal, entry] of Object.entries(board.terminals)) {
    const allFiles = normalizeFileSet([
      ...(entry.plannedFiles ?? []),
      ...(entry.modifiedFiles ?? []),
    ]);

    for (const file of allFiles) {
      const owners = byFile.get(file) ?? [];
      owners.push(terminal);
      byFile.set(file, owners);
    }
  }

  return [...byFile.entries()]
    .filter(([, terminals]) => new Set(terminals).size > 1)
    .map(([file, terminals]) => ({
      file,
      terminals: [...new Set(terminals)].sort(),
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function loadBoard(boardPath) {
  if (!fs.existsSync(boardPath)) {
    return createEmptyBoard();
  }

  const raw = fs.readFileSync(boardPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    ...createEmptyBoard(),
    ...parsed,
    terminals: parsed.terminals ?? {},
  };
}

export function saveBoard(boardPath, board) {
  fs.mkdirSync(path.dirname(boardPath), { recursive: true });
  fs.writeFileSync(boardPath, `${JSON.stringify(board, null, 2)}\n`, "utf8");
}

export function normalizeFilePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function normalizeFileSet(files) {
  return [...new Set((files ?? []).map(normalizeFilePath).filter(Boolean))].sort();
}

function getCommonDir(cwd) {
  return execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8" },
  ).trim();
}

function getCurrentBranch(cwd) {
  return execFileSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
  }).trim();
}

function getModifiedFiles(cwd) {
  const output = execFileSync("git", ["status", "--short"], {
    cwd,
    encoding: "utf8",
  });

  return parseGitStatus(output);
}

function printUsage() {
  console.log(`Usage:
  pnpm coord init
  pnpm coord show
  pnpm coord check
  pnpm coord plan <terminal> <task> <file...>
  pnpm coord sync <terminal> <status> [task]
  pnpm coord clear <terminal>`);
}

export function runCli(argv, cwd = process.cwd()) {
  const [command, ...rest] = argv;
  const commonDir = getCommonDir(cwd);
  const boardPath = buildBoardPathFromCommonDir(commonDir);
  let board = loadBoard(boardPath);

  switch (command) {
    case "init": {
      saveBoard(boardPath, board);
      console.log(`Initialized coordination board at ${boardPath}`);
      return 0;
    }
    case "show": {
      console.log(JSON.stringify({ boardPath, board, conflicts: detectConflicts(board) }, null, 2));
      return 0;
    }
    case "check": {
      const conflicts = detectConflicts(board);

      if (conflicts.length === 0) {
        console.log("No coordination conflicts detected.");
        return 0;
      }

      console.log(JSON.stringify(conflicts, null, 2));
      return 1;
    }
    case "plan": {
      const [terminal, task, ...files] = rest;

      if (!terminal || !task || files.length === 0) {
        printUsage();
        return 1;
      }

      board = upsertTerminalEntry(board, {
        branch: getCurrentBranch(cwd),
        plannedFiles: files,
        status: "planned",
        task,
        terminal,
      });
      saveBoard(boardPath, board);
      console.log(`Planned files recorded for terminal ${terminal}.`);
      return 0;
    }
    case "sync": {
      const [terminal, status, ...taskParts] = rest;

      if (!terminal || !status) {
        printUsage();
        return 1;
      }

      board = upsertTerminalEntry(board, {
        branch: getCurrentBranch(cwd),
        modifiedFiles: getModifiedFiles(cwd),
        status,
        task: taskParts.join(" "),
        terminal,
      });
      saveBoard(boardPath, board);
      console.log(`Synchronized terminal ${terminal} status.`);
      return 0;
    }
    case "clear": {
      const [terminal] = rest;

      if (!terminal) {
        printUsage();
        return 1;
      }

      board = clearTerminal(board, terminal);
      saveBoard(boardPath, board);
      console.log(`Cleared terminal ${terminal}.`);
      return 0;
    }
    default: {
      printUsage();
      return 1;
    }
  }
}

const thisFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] === thisFilePath) {
  process.exitCode = runCli(process.argv.slice(2));
}
