#!/usr/bin/env bash
# Start API gateway + all domain microservices (shared DB phase 1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${LOG_DIR:-$ROOT/logs/microservices}"
mkdir -p "$LOG_DIR"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(tr -d '\r' < "$ROOT/.env")
  set +a
fi

export AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-http://127.0.0.1:3001}"
export USERS_SERVICE_URL="${USERS_SERVICE_URL:-http://127.0.0.1:3002}"
export FLEET_SERVICE_URL="${FLEET_SERVICE_URL:-http://127.0.0.1:3003}"
export FINANCE_SERVICE_URL="${FINANCE_SERVICE_URL:-http://127.0.0.1:3004}"
export ADMIN_SERVICE_URL="${ADMIN_SERVICE_URL:-http://127.0.0.1:3005}"

GATEWAY_PORT="${GATEWAY_PORT:-${PORT:-3000}}"
PIDS=()

start_one() {
  local name="$1"
  local port="$2"
  echo "Starting $name on :$port ..."
  SERVICE_NAME="$name" PORT="$port" npx tsx src/microservices/server.ts \
    >"$LOG_DIR/$name.log" 2>&1 &
  PIDS+=($!)
  echo "  pid ${PIDS[-1]}  log $LOG_DIR/$name.log"
}

cleanup() {
  echo ""
  echo "Stopping microservices..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start_one auth 3001
start_one users 3002
start_one fleet 3003
start_one finance 3004
start_one admin 3005
sleep 1
start_one gateway "$GATEWAY_PORT"

echo ""
echo "Microservices running. Public entry: http://localhost:${GATEWAY_PORT}/api/v1"
echo "Health: http://localhost:${GATEWAY_PORT}/health"
echo "If port 3000 is already used (e.g. PM2 monolith), run: GATEWAY_PORT=3010 npm run ms:start"
echo "Press Ctrl+C to stop all."
wait
