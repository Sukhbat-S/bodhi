#!/bin/bash
# ============================================================
# BODHI — One-Command Startup
# Kills stale processes, starts server + dashboard
# Usage: ./scripts/start.sh
# ============================================================

set -e

BODHI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BODHI_DIR/logs"
mkdir -p "$LOG_DIR"

echo "=== BODHI Starting ==="

# Kill stale processes on ports 4000 and 5173
for PORT in 4000 5173; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Killing stale processes on port $PORT..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

cd "$BODHI_DIR"

# Start server (API + Telegram + all services)
echo "Starting BODHI server on :4000..."
nohup npm run dev -w @seneca/server > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$LOG_DIR/server.pid"

# Start dashboard
echo "Starting dashboard on :5173..."
nohup npm run dev -w @seneca/dashboard > "$LOG_DIR/dashboard.log" 2>&1 &
DASH_PID=$!
echo "$DASH_PID" > "$LOG_DIR/dashboard.pid"

# Wait for server to be ready
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
echo "=== BODHI Running ==="
echo "  Server:    http://localhost:4000"
echo "  Dashboard: http://localhost:5173"
echo "  Logs:      $LOG_DIR/"
echo ""
echo "Stop with: ./scripts/stop.sh"
