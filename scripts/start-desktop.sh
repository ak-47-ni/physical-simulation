#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_URL="http://localhost:1420"
FRONTEND_LOG="${ROOT_DIR}/.desktop-vite.log"
DESKTOP_ENV_FILE="${ROOT_DIR}/.desktop.env"
FRONTEND_PID=""

cleanup() {
  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi
}

wait_for_frontend() {
  for _ in {1..80}; do
    if curl --fail --silent --show-error "${FRONTEND_URL}" >/dev/null 2>&1; then
      return 0
    fi

    if [[ -n "${FRONTEND_PID}" ]] && ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
      echo "Frontend dev server exited before ${FRONTEND_URL} became available." >&2
      tail -n 80 "${FRONTEND_LOG}" >&2 || true
      return 1
    fi

    sleep 0.25
  done

  echo "Timed out waiting for frontend dev server at ${FRONTEND_URL}." >&2
  tail -n 80 "${FRONTEND_LOG}" >&2 || true
  return 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_desktop_env() {
  if [[ ! -f "${DESKTOP_ENV_FILE}" ]]; then
    return 0
  fi

  echo "Loading desktop environment from ${DESKTOP_ENV_FILE}."
  set -a
  # shellcheck disable=SC1090
  source "${DESKTOP_ENV_FILE}"
  set +a
}

trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"

require_command cargo
require_command curl
require_command pnpm

load_desktop_env

if curl --fail --silent --show-error "${FRONTEND_URL}" >/dev/null 2>&1; then
  echo "Using existing frontend dev server at ${FRONTEND_URL}."
else
  echo "Starting frontend dev server at ${FRONTEND_URL}."
  pnpm --filter desktop run dev --host 127.0.0.1 --port 1420 --strictPort \
    >"${FRONTEND_LOG}" 2>&1 &
  FRONTEND_PID="$!"
  wait_for_frontend
fi

echo "Starting Tauri desktop shell with Cargo."
cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml
