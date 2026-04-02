#!/bin/bash
# ============================================================
# BODHI — One-Command Startup (Single Server)
#
# Builds dashboard into static files, then starts ONE server
# that serves both API + Dashboard on port 4000.
#
# Usage: ./scripts/start.sh [--dev]
#   --dev  = two-server mode (Vite HMR on :5173 + API on :4000)
#   default = production mode (single server on :4000)
# ============================================================

set -e

BODHI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BODHI_DIR/logs"
mkdir -p "$LOG_DIR"

DEV_MODE=false
if [[ "$1" == "--dev" ]]; then
  DEV_MODE=true
fi

echo "=== BODHI Starting ==="

# Kill stale processes on port 4000 (and 5173 if dev mode)
PORTS="4000"
$DEV_MODE && PORTS="4000 5173"
for PORT in $PORTS; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Killing stale processes on port $PORT..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

cd "$BODHI_DIR"

if $DEV_MODE; then
  # === DEV MODE: Two servers, Vite HMR ===
  echo "Mode: development (two servers)"

  echo "Starting BODHI server on :4000..."
  nohup npm run dev -w @seneca/server > "$LOG_DIR/server.log" 2>&1 &
  echo $! > "$LOG_DIR/server.pid"

  echo "Starting dashboard on :5173..."
  nohup npm run dev -w @seneca/dashboard > "$LOG_DIR/dashboard.log" 2>&1 &
  echo $! > "$LOG_DIR/dashboard.pid"

  # Wait for server
  echo -n "Waiting for server"
  for i in $(seq 1 30); do
    if curl -s http://localhost:4000/ > /dev/null 2>&1; then
      echo " ready!"
      break
    fi
    echo -n "."
    sleep 1
  done

  echo ""
  echo "=== BODHI Running (dev) ==="
  echo "  API:       http://localhost:4000"
  echo "  Dashboard: http://localhost:5173"
  echo "  Logs:      $LOG_DIR/"

else
  # === PRODUCTION MODE: Single server ===
  echo "Mode: local production (single server)"

  # Build dashboard if needed (skip if dist exists and is recent)
  DIST_DIR="$BODHI_DIR/apps/dashboard/dist"
  if [ ! -f "$DIST_DIR/index.html" ]; then
    echo "Building dashboard..."
    npm run build -w @seneca/dashboard 2>&1 | tail -3
  else
    echo "Dashboard already built (use --rebuild to force)"
  fi

  # Rebuild if --rebuild flag
  if [[ "$*" == *"--rebuild"* ]]; then
    echo "Rebuilding dashboard..."
    npm run build -w @seneca/dashboard 2>&1 | tail -3
  fi

  # Start single server (serves API + static dashboard)
  echo "Starting BODHI on :4000..."
  nohup npm run dev -w @seneca/server > "$LOG_DIR/server.log" 2>&1 &
  echo $! > "$LOG_DIR/server.pid"

  # Wait for server
  echo -n "Waiting"
  for i in $(seq 1 30); do
    if curl -s http://localhost:4000/ > /dev/null 2>&1; then
      echo " ready!"
      break
    fi
    echo -n "."
    sleep 1
  done

  echo ""
  echo "=== BODHI Running ==="
  echo "  Everything: http://localhost:4000"
  echo "  Logs:       $LOG_DIR/server.log"
fi

echo ""
echo "Stop with: ./scripts/stop.sh"
