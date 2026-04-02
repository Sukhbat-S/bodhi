#!/bin/bash
# ============================================================
# BODHI Auto-Start — Add to your .zshrc:
#
#   # BODHI auto-start
#   export BODHI_DIR=~/Documents/bodhi  # optional, defaults to ~/Documents/bodhi
#   source $BODHI_DIR/scripts/bodhi-autostart.sh
#
# What it does:
# - Checks if BODHI is already running (idempotent)
# - If not, starts it in background (no blocking your terminal)
# - Adds `bodhi` alias for quick access
# ============================================================

# Quick alias
BODHI_DIR="${BODHI_DIR:-$HOME/Documents/bodhi}"
alias bodhi-start="cd $BODHI_DIR && bash scripts/start.sh"
alias bodhi-stop="cd $BODHI_DIR && bash scripts/stop.sh"
alias bodhi-dev="cd $BODHI_DIR && bash scripts/start.sh --dev"
alias bodhi-logs="tail -f $BODHI_DIR/logs/server.log"
alias bodhi-status="curl -s http://localhost:4000/api/status 2>/dev/null | python3 -m json.tool 2>/dev/null || echo 'BODHI is not running'"

# Auto-start: check if BODHI is running, start if not
# Only runs once per terminal session, silently in background
if ! curl -s --max-time 1 http://localhost:4000/ > /dev/null 2>&1; then
  echo "Starting BODHI..."
  (cd "$BODHI_DIR" && bash scripts/start.sh > /dev/null 2>&1 &)
fi
