#!/bin/sh
# start.sh — launches FastAPI backend + Next.js frontend in one container.
#
# Backend binds to :8091 (internal only).
# Frontend binds to $PORT (default 10000, what Render/most PaaS expose).
#
# Both run as background processes; their stdout/stderr are piped through
# tee to /var/log/{backend,frontend}.log so docker logs shows everything.

set -e

# --- Backend ---
echo "[start.sh] launching FastAPI backend on :8091"
cd /app/backend
PORT=8091 \
  OMNIROUTE_BASE_URL="${OMNIROUTE_BASE_URL:-}" \
  OMNIROUTE_API_KEY="${OMNIROUTE_API_KEY:-}" \
  MINIMAX_API_KEY="${MINIMAX_API_KEY:-}" \
  AUDIO_CLEANUP_INTERVAL_SECONDS="${AUDIO_CLEANUP_INTERVAL_SECONDS:-3600}" \
  AUDIO_MAX_AGE_SECONDS="${AUDIO_MAX_AGE_SECONDS:-3600}" \
  python -m uvicorn app.main:app --host 0.0.0.0 --port 8091 \
  > /var/log/backend.log 2>&1 &
BACKEND_PID=$!

# --- Frontend ---
echo "[start.sh] launching Next.js frontend on :${PORT:-10000}"
cd /app/frontend
PORT="${PORT:-10000}" \
  NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8091}" \
  HOST=0.0.0.0 \
  npm run start \
  > /var/log/frontend.log 2>&1 &
FRONTEND_PID=$!

# --- Trap: clean shutdown if either dies or container stops ---
shutdown() {
  echo "[start.sh] shutting down..."
  kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  kill -TERM "$BACKEND_PID"  2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# --- Wait for both, exit if either dies ---
echo "[start.sh] backend pid=$BACKEND_PID, frontend pid=$FRONTEND_PID"
while true; do
  # If either process is gone, kill the other and exit non-zero so
  # the orchestrator can restart the container.
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[start.sh] backend died, see /var/log/backend.log"
    tail -50 /var/log/backend.log
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "[start.sh] frontend died, see /var/log/frontend.log"
    tail -50 /var/log/frontend.log
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 5
done
