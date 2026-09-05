#!/bin/bash
set -e

# E2E test harness: starts backend + frontend locally, runs Playwright tests, tears down.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_PID=""
FRONTEND_PID=""
MAX_RETRIES=30
RETRY_INTERVAL=2

# ── helpers ──────────────────────────────────────────────────────────────────

is_port_free() {
  ! nc -z 127.0.0.1 "$1" 2>/dev/null
}

wait_for_healthy() {
  local url="$1"
  local name="$2"
  local retries=$MAX_RETRIES
  echo "[e2e] Waiting for $name at $url ..."
  while (( retries > 0 )); do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "[e2e] $name is ready"
      return 0
    fi
    retries=$((retries - 1))
    sleep $RETRY_INTERVAL
  done
  echo "[e2e] ERROR: $name failed to become ready at $url after $MAX_RETRIES retries" >&2
  return 1
}

teardown() {
  echo "[e2e] Tearing down..."
  local pids="$BACKEND_PID $FRONTEND_PID"
  for pid in $pids; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "[e2e] Killed PID $pid" || true
    fi
  done
  echo "[e2e] Teardown complete"
}

# ── port conflict checks ──────────────────────────────────────────────────────

echo "[e2e] Checking port availability..."
if ! is_port_free $BACKEND_PORT; then
  echo "[e2e] WARNING: port $BACKEND_PORT is already in use — backend may fail to start" >&2
fi
if ! is_port_free $FRONTEND_PORT; then
  echo "[e2e] WARNING: port $FRONTEND_PORT is already in use — frontend may fail to start" >&2
fi

# ── trap EXIT (and ERR) ──────────────────────────────────────────────────────

trap teardown EXIT
trap 'exit 1' ERR

# ── start backend ────────────────────────────────────────────────────────────

echo "[e2e] Starting backend on port $BACKEND_PORT ..."
cd "$BACKEND_DIR"
uv run uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT &
BACKEND_PID=$!
echo "[e2e] Backend PID: $BACKEND_PID"

# ── build + start frontend ────────────────────────────────────────────────────

echo "[e2e] Building frontend ..."
cd "$FRONTEND_DIR"
npm run build

echo "[e2e] Starting frontend on port $FRONTEND_PORT ..."
npm run start -- -p $FRONTEND_PORT &
FRONTEND_PID=$!
echo "[e2e] Frontend PID: $FRONTEND_PID"

# ── health checks ─────────────────────────────────────────────────────────────

wait_for_healthy "http://127.0.0.1:$BACKEND_PORT/api/health" "backend"
wait_for_healthy "http://127.0.0.1:$FRONTEND_PORT" "frontend"

# ── run Playwright tests ──────────────────────────────────────────────────────

echo "[e2e] Running Playwright tests against localhost ..."
cd "$FRONTEND_DIR"
npx playwright test

echo "[e2e] All done."
