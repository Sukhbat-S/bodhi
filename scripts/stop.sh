#!/bin/bash
# ============================================================
# BODHI — Clean Shutdown
# Usage: ./scripts/stop.sh
# ============================================================

BODHI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BODHI_DIR/logs"

echo "=== BODHI Stopping ==="

# Kill by saved PIDs
for SERVICE in server dashboard; do
  PID_FILE="$LOG_DIR/$SERVICE.pid"
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "Stopping $SERVICE (PID $PID)..."
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
done

# Also kill anything on the ports (safety net)
for PORT in 4000 5173; do
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Cleaning up port $PORT..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fi
done

echo "=== BODHI Stopped ==="
