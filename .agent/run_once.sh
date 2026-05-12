#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$ROOT_DIR/.agent"
BACKLOG_FILE="$AGENT_DIR/backlog.md"
RULES_FILE="$AGENT_DIR/rules.md"
RUNS_DIR="$AGENT_DIR/runs"
VERIFY_SCRIPT="$AGENT_DIR/verify.sh"
CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_MODEL="${CODEX_MODEL:-}"
CODEX_ARGS="${CODEX_ARGS:-}"
MAX_ATTEMPTS="${AGENT_MAX_ATTEMPTS:-3}"

mkdir -p "$RUNS_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
run_dir="$RUNS_DIR/$timestamp"
mkdir -p "$run_dir"

log() {
  printf '%s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

if [[ ! -f "$BACKLOG_FILE" ]]; then
  fail "Missing backlog file: $BACKLOG_FILE"
fi

if [[ ! -f "$RULES_FILE" ]]; then
  fail "Missing rules file: $RULES_FILE"
fi

if [[ ! -x "$VERIFY_SCRIPT" ]]; then
  fail "Verify script is missing or not executable: $VERIFY_SCRIPT"
fi

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  fail "Codex binary not found on PATH: $CODEX_BIN"
fi

task_line="$(grep -nE '^[[:space:]]*-[[:space:]]+\[[[:space:]]\][[:space:]]+.+' "$BACKLOG_FILE" | head -n 1 || true)"

if [[ -z "$task_line" ]]; then
  log "No pending task found in $BACKLOG_FILE."
  log "Run directory: $run_dir"
  exit 0
fi

task_line_number="${task_line%%:*}"
task_text="${task_line#*:}"
task_text="$(printf '%s' "$task_text" | sed -E 's/^[[:space:]]*-[[:space:]]+\[[[:space:]]\][[:space:]]+//')"

printf '%s\n' "$task_text" > "$run_dir/task.txt"
git status --short --branch > "$run_dir/git-status-before.txt"

attempt=1
success=0
previous_error_context=""

while [[ "$attempt" -le "$MAX_ATTEMPTS" ]]; do
  attempt_dir="$run_dir/attempt-$attempt"
  mkdir -p "$attempt_dir"

  prompt_file="$attempt_dir/prompt.md"
  codex_log="$attempt_dir/codex.log"
  last_message="$attempt_dir/codex-last-message.md"
  verify_log="$attempt_dir/verify.log"

  {
    printf '# Local Agent Harness Task\n\n'
    printf 'Repository: `%s`\n\n' "$ROOT_DIR"
    printf 'Backlog line: `%s`\n\n' "$task_line_number"
    printf '## Task\n\n%s\n\n' "$task_text"
    printf '## Harness Rules\n\n'
    cat "$RULES_FILE"
    printf '\n\n## Required Workflow\n\n'
    printf '1. Inspect only the files needed for this task.\n'
    printf '2. Implement the task in the current working tree.\n'
    printf '3. Do not commit and do not push.\n'
    printf '4. Do not delete files or read secrets.\n'
    printf '5. Before finishing, run `.agent/verify.sh` if possible.\n'
    printf '6. Final response must include changed files, verification result, and next-step recommendation.\n'

    if [[ -n "$previous_error_context" ]]; then
      printf '\n\n## Previous Attempt Failure Context\n\n'
      printf '%s\n' "$previous_error_context"
    fi
  } > "$prompt_file"

  log "Attempt $attempt/$MAX_ATTEMPTS: running Codex for task: $task_text"

  set +e
  if [[ -n "$CODEX_MODEL" ]]; then
    # shellcheck disable=SC2086
    "$CODEX_BIN" exec --cd "$ROOT_DIR" --sandbox workspace-write --ask-for-approval on-request --model "$CODEX_MODEL" --output-last-message "$last_message" $CODEX_ARGS - < "$prompt_file" > "$codex_log" 2>&1
  else
    # shellcheck disable=SC2086
    "$CODEX_BIN" exec --cd "$ROOT_DIR" --sandbox workspace-write --ask-for-approval on-request --output-last-message "$last_message" $CODEX_ARGS - < "$prompt_file" > "$codex_log" 2>&1
  fi
  codex_status=$?
  set -e

  if [[ "$codex_status" -ne 0 ]]; then
    previous_error_context="$(tail -n 120 "$codex_log")"
    printf 'Codex failed with exit code %s.\n' "$codex_status" > "$attempt_dir/result.txt"
    attempt=$((attempt + 1))
    continue
  fi

  log "Attempt $attempt/$MAX_ATTEMPTS: running verification."
  set +e
  "$VERIFY_SCRIPT" > "$verify_log" 2>&1
  verify_status=$?
  set -e

  if [[ "$verify_status" -eq 0 ]]; then
    success=1
    printf 'SUCCESS\n' > "$attempt_dir/result.txt"
    break
  fi

  previous_error_context="$(tail -n 180 "$verify_log")"
  printf 'Verification failed with exit code %s.\n' "$verify_status" > "$attempt_dir/result.txt"
  attempt=$((attempt + 1))
done

git status --short --branch > "$run_dir/git-status-after.txt"
git diff --stat > "$run_dir/git-diff-stat.txt"
git diff --name-only > "$run_dir/git-diff-files.txt"
git diff --summary > "$run_dir/git-diff-summary.txt"

summary_file="$run_dir/summary.md"
{
  printf '# Agent Harness Run Summary\n\n'
  printf '- Run: `%s`\n' "$timestamp"
  printf '- Backlog line: `%s`\n' "$task_line_number"
  printf '- Task: %s\n' "$task_text"
  printf '- Attempts used: %s\n' "$attempt"
  if [[ "$success" -eq 1 ]]; then
    printf '- Result: SUCCESS\n\n'
  else
    printf '- Result: FAILED\n\n'
  fi

  printf '## Changed Files\n\n'
  if [[ -s "$run_dir/git-diff-files.txt" ]]; then
    sed 's/^/- `/' "$run_dir/git-diff-files.txt" | sed 's/$/`/'
  else
    printf 'No tracked file changes detected.\n'
  fi

  printf '\n## Diff Stat\n\n```text\n'
  cat "$run_dir/git-diff-stat.txt"
  printf '```\n\n'

  printf '## Next Step\n\n'
  if [[ "$success" -eq 1 ]]; then
    printf 'Review the working tree and run any additional manual checks. Commit manually if acceptable.\n'
  else
    printf 'Open the latest attempt logs under `%s` and decide whether to retry manually or adjust the backlog task.\n' "$run_dir"
  fi
} > "$summary_file"

cat "$summary_file"

if [[ "$success" -eq 1 ]]; then
  exit 0
fi

exit 1
