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
alias bodhi-status="curl -s http://localhost:4000/api/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo 'BODHI is not running'"

# Auto-start: check if BODHI is running, start if not
# Only runs once per terminal session, silently in background
if ! curl -s --max-time 1 http://localhost:4000/ > /dev/null 2>&1; then
  echo "Starting BODHI..."
  (cd ~/Documents/bodhi && bash scripts/start.sh > /dev/null 2>&1 &)
fi
