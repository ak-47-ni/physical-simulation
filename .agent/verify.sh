#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

RUN_PNPM_TESTS="${AGENT_VERIFY_PNPM_TESTS:-1}"
RUN_DESKTOP_BUILD="${AGENT_VERIFY_DESKTOP_BUILD:-1}"
RUN_RUST_TESTS="${AGENT_VERIFY_RUST_TESTS:-1}"

status=0

run_step() {
  local name="$1"
  shift

  printf '\n== %s ==\n' "$name"
  printf '+'
  printf ' %q' "$@"
  printf '\n'

  if "$@"; then
    printf 'PASS: %s\n' "$name"
  else
    local code=$?
    printf 'FAIL: %s (exit %s)\n' "$name" "$code"
    status=1
  fi
}

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'SKIP: pnpm is not installed or not on PATH.\n'
else
  if [[ -f "pnpm-workspace.yaml" && "$RUN_PNPM_TESTS" != "0" ]]; then
    run_step "pnpm workspace tests" pnpm -r test
  fi

  if [[ -f "apps/desktop/package.json" && "$RUN_DESKTOP_BUILD" != "0" ]]; then
    run_step "desktop Vite build" pnpm --filter desktop build
  fi
fi

if ! command -v cargo >/dev/null 2>&1; then
  printf 'SKIP: cargo is not installed or not on PATH.\n'
else
  if [[ "$RUN_RUST_TESTS" != "0" ]]; then
    if [[ -f "crates/sim-core/Cargo.toml" ]]; then
      run_step "sim-core Rust tests" cargo test --manifest-path crates/sim-core/Cargo.toml
    fi

    if [[ -f "apps/desktop/src-tauri/Cargo.toml" ]]; then
      run_step "desktop shell Rust tests" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
    fi
  fi
fi

printf '\n== verify result ==\n'
if [[ "$status" -eq 0 ]]; then
  printf 'PASS\n'
else
  printf 'FAIL\n'
fi

exit "$status"
