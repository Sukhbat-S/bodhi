#!/bin/bash
# BODHI Heartbeat — Autonomous health monitoring via Claude Code
# Runs every 30 minutes via cron
#
# Cron entry:
#   */30 * * * * /path/to/bodhi/scripts/heartbeat.sh >> /path/to/bodhi/logs/heartbeat.log 2>&1

set -e

BODHI_DIR="${BODHI_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_DIR="$BODHI_DIR/logs"
HEARTBEAT_FILE="$BODHI_DIR/HEARTBEAT.md"
LOCK_FILE="$LOG_DIR/heartbeat.lock"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SKIP: Previous heartbeat still running (PID $LOCK_PID)"
        exit 0
    fi
    # Stale lock file — remove it
    rm -f "$LOCK_FILE"
fi

# Create lock
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HEARTBEAT: Starting"

# Quick check — is BODHI server even running?
if ! curl -s --max-time 5 http://localhost:4000/api/status > /dev/null 2>&1; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HEARTBEAT: Server not responding, skipping Claude check"
    # Can't use Claude to alert via Telegram if server is down
    # TODO: Could send alert via direct Telegram API call here
    exit 1
fi

# Run Claude Code with the heartbeat prompt
# Uses --max-turns to limit cost, -p for non-interactive mode
cd "$BODHI_DIR"
claude -p "Read HEARTBEAT.md and execute the applicable tasks for the current time. Be concise. Log results." \
    --max-turns 10 \
    --output-format text \
    2>/dev/null || true

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HEARTBEAT: Complete"
