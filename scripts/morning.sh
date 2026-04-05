#!/bin/bash
# ============================================================
# BODHI Morning Routine
#
# Wake up to BODHI: speaks your briefing, opens your tools,
# and sets you up for the day.
#
# Usage:
#   bash scripts/morning.sh
#
# Automate: Add to macOS Login Items or schedule with cron
#   crontab -e → 0 8 * * * cd ~/Documents/bodhi && bash scripts/morning.sh
# ============================================================

BODHI_URL="${BODHI_URL:-http://localhost:4000}"
VOICE="${BODHI_VOICE:-Samantha}"

# Check if BODHI is running, start if not
if ! curl -s "$BODHI_URL/health" > /dev/null 2>&1; then
  echo "Starting BODHI..."
  cd ~/Documents/bodhi && bash scripts/start.sh &
  sleep 10
fi

# Greet
HOUR=$(date +%H)
if [ "$HOUR" -lt 12 ]; then
  GREETING="Good morning"
elif [ "$HOUR" -lt 18 ]; then
  GREETING="Good afternoon"
else
  GREETING="Good evening"
fi

say -v "$VOICE" "$GREETING. Let me prepare your briefing."

# Open essential apps
open -a "Arc" 2>/dev/null || open -a "Google Chrome" 2>/dev/null
open -a "Visual Studio Code" 2>/dev/null || open -a "Cursor" 2>/dev/null
open "http://localhost:4000" 2>/dev/null  # BODHI Dashboard

# Wait a moment for apps to open
sleep 3

# Trigger and speak morning briefing
RESPONSE=$(curl -s -X POST "$BODHI_URL/api/scheduler/trigger" \
  -H "Content-Type: application/json" \
  -d '{"type":"morning"}' --max-time 45)

CONTENT=$(echo "$RESPONSE" | python3 -c "
import sys, json, re
d = json.load(sys.stdin)
text = d.get('content', d.get('briefing', d.get('message', 'No briefing available.')))
# Strip markdown
text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
text = re.sub(r'\*([^*]+)\*', r'\1', text)
text = re.sub(r'#{1,3}\s*', '', text)
text = re.sub(r'- ', '', text)
text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
print(text)
" 2>/dev/null || echo "Could not generate briefing.")

# Speak the briefing
say -v "$VOICE" "$CONTENT"

# Final prompt
say -v "$VOICE" "That's your briefing. Ready when you are."
