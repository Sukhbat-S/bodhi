#!/bin/bash
# ============================================================
# BODHI Auto-Start — Add to your .zshrc:
#
#   # BODHI auto-start
#   source ~/Documents/bodhi/scripts/bodhi-autostart.sh
#
# What it does:
# - Checks if BODHI is already running (idempotent)
# - If not, starts it in background (no blocking your terminal)
# - Adds `bodhi` alias for quick access
# ============================================================

# Quick alias
alias bodhi-start="cd ~/Documents/bodhi && bash scripts/start.sh"
alias bodhi-stop="cd ~/Documents/bodhi && bash scripts/stop.sh"
alias bodhi-dev="cd ~/Documents/bodhi && bash scripts/start.sh --dev"
alias bodhi-logs="tail -f ~/Documents/bodhi/logs/server.log"
alias bodhi-status="curl -s http://localhost:${BODHI_PORT:-4000}/api/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo 'BODHI is not running'"

# Auto-start: check if BODHI is running, start if not
# Only runs once per terminal session, silently in background
if ! curl -s --max-time 1 http://localhost:${BODHI_PORT:-4000}/ > /dev/null 2>&1; then
  echo "Starting BODHI..."
  (cd ~/Documents/bodhi && bash scripts/start.sh > /dev/null 2>&1 &)
fi

# Auto-register session (background, non-blocking)
# Waits for server to be ready, then registers a default session
(
  for _i in 1 2 3 4 5; do
    curl -s --max-time 2 http://localhost:${BODHI_PORT:-4000}/api/status > /dev/null 2>&1 && break
    sleep 3
  done
  curl -s -X POST http://localhost:${BODHI_PORT:-4000}/api/sessions/active \
    -H 'Content-Type: application/json' \
    -d '{"id":"mac-main","project":"bodhi","description":"Auto-started"}' > /dev/null 2>&1
  echo "mac-main" > /tmp/bodhi-session-id

  # Keep session alive with periodic pings (every 60s)
  while true; do
    sleep 60
    curl -s -X POST http://localhost:${BODHI_PORT:-4000}/api/sessions/active/mac-main/ping \
      -H 'Content-Type: application/json' -d '{}' > /dev/null 2>&1 || break
  done
) &
