#!/bin/bash
# BODHI SessionStart Hook — Auto-inject context into Claude Code sessions
# Outputs formatted context to stdout (visible to Claude as injected context)

BODHI_URL="${BODHI_URL:-http://localhost:4000}"
BODHI_DIR="/Users/macbookpro/Documents/bodhi"
TMPDIR_SESSION="${TMPDIR:-/tmp}/bodhi-session-$$"

cleanup() { rm -rf "$TMPDIR_SESSION" 2>/dev/null; }
trap cleanup EXIT

# Health check — if BODHI is offline, print notice and exit
if ! curl -s --max-time 2 "$BODHI_URL/api/status" > /dev/null 2>&1; then
  echo "[BODHI] Server offline. Run /start to bring it up."
  exit 0
fi

mkdir -p "$TMPDIR_SESSION"

# Parallel data fetches
curl -s --max-time 5 "$BODHI_URL/api/status" > "$TMPDIR_SESSION/status.json" 2>/dev/null &
curl -s --max-time 5 "$BODHI_URL/api/memories/search?q=session-summary+bodhi&limit=2&days=7" > "$TMPDIR_SESSION/sessions.json" 2>/dev/null &
curl -s --max-time 5 "$BODHI_URL/api/memories/search?q=pending+bodhi&limit=3&days=7" > "$TMPDIR_SESSION/pending.json" 2>/dev/null &
curl -s --max-time 5 "$BODHI_URL/api/calendar/today" > "$TMPDIR_SESSION/calendar.json" 2>/dev/null &
curl -s --max-time 5 "$BODHI_URL/api/gmail/unread" > "$TMPDIR_SESSION/gmail.json" 2>/dev/null &
git -C "$BODHI_DIR" log --since='3 days ago' --oneline --no-merges -10 > "$TMPDIR_SESSION/git.txt" 2>/dev/null &
wait

# Check for jq
if ! command -v jq &> /dev/null; then
  echo "[BODHI Context — Auto-Loaded (raw, jq not found)]"
  echo ""
  cat "$TMPDIR_SESSION/status.json" 2>/dev/null
  echo ""
  echo "Git (3 days):"
  cat "$TMPDIR_SESSION/git.txt" 2>/dev/null
  exit 0
fi

# --- Format output ---
echo "[BODHI Context — Auto-Loaded]"
echo ""

# Status line
UPTIME=$(jq -r '.uptime // 0 | floor' "$TMPDIR_SESSION/status.json" 2>/dev/null)
if [ -n "$UPTIME" ] && [ "$UPTIME" != "null" ] && [ "$UPTIME" -gt 0 ] 2>/dev/null; then
  HOURS=$((UPTIME / 3600))
  MINS=$(( (UPTIME % 3600) / 60 ))
  UPTIME_STR="${HOURS}h ${MINS}m"
else
  UPTIME_STR="unknown"
fi

SERVICES=""
for svc in memory gmail calendar telegram notion scheduler; do
  VAL=$(jq -r ".${svc} // empty" "$TMPDIR_SESSION/status.json" 2>/dev/null)
  if [ -n "$VAL" ] && [ "$VAL" != "null" ] && [ "$VAL" != "disconnected" ] && [ "$VAL" != "offline" ]; then
    SERVICES="${SERVICES}${svc}, "
  fi
done
SERVICES="${SERVICES%, }"

echo "Server: online (${UPTIME_STR}) | Services: ${SERVICES}"
echo ""

# Git activity
GIT_LOG=$(cat "$TMPDIR_SESSION/git.txt" 2>/dev/null)
if [ -n "$GIT_LOG" ]; then
  echo "Recent git (3 days):"
  echo "$GIT_LOG" | while IFS= read -r line; do echo "  $line"; done
  echo ""
fi

# Last session summary
SESSION_MEM=$(jq -r '.memories[0].content // empty' "$TMPDIR_SESSION/sessions.json" 2>/dev/null)
if [ -n "$SESSION_MEM" ]; then
  # Truncate to 300 chars
  PREVIEW="${SESSION_MEM:0:300}"
  [ ${#SESSION_MEM} -gt 300 ] && PREVIEW="${PREVIEW}..."
  echo "Last session: $PREVIEW"
  echo ""
fi

# Pending items
PENDING_COUNT=$(jq '.memories | length' "$TMPDIR_SESSION/pending.json" 2>/dev/null)
if [ -n "$PENDING_COUNT" ] && [ "$PENDING_COUNT" -gt 0 ] 2>/dev/null; then
  echo "Pending context:"
  jq -r '.memories[:3][] | .content' "$TMPDIR_SESSION/pending.json" 2>/dev/null | while IFS= read -r line; do
    PREVIEW="${line:0:150}"
    [ ${#line} -gt 150 ] && PREVIEW="${PREVIEW}..."
    echo "  - $PREVIEW"
  done
  echo ""
fi

# Calendar
EVENT_COUNT=$(jq '.events | length' "$TMPDIR_SESSION/calendar.json" 2>/dev/null)
if [ -n "$EVENT_COUNT" ] && [ "$EVENT_COUNT" -gt 0 ] 2>/dev/null; then
  echo "Today's calendar:"
  jq -r '.events[] | "  \(.start[11:16])-\(.end[11:16]): \(.summary)"' "$TMPDIR_SESSION/calendar.json" 2>/dev/null
  echo ""
fi

# Unread emails
UNREAD=$(jq -r '.unread // empty' "$TMPDIR_SESSION/gmail.json" 2>/dev/null)
if [ -n "$UNREAD" ] && [ "$UNREAD" != "null" ]; then
  echo "Unread emails: $UNREAD"
  echo ""
fi

echo "Tip: /session-start for full context | /session-save at end"
