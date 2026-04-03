#!/bin/bash
# BODHI SessionEnd Hook — Store breadcrumb memory when session closes
# Lightweight: records that a session happened, even if /session-save was forgotten

BODHI_URL="${BODHI_URL:-http://localhost:4000}"
BODHI_DIR="/Users/macbookpro/Documents/bodhi"

# Health check — if BODHI is offline, exit silently
if ! curl -s --max-time 1 "$BODHI_URL/api/status" > /dev/null 2>&1; then
  exit 0
fi

# Gather git state
LAST_COMMIT=$(git -C "$BODHI_DIR" log --oneline -1 2>/dev/null || echo "no commits")
DIFF_STAT=$(git -C "$BODHI_DIR" diff --stat HEAD 2>/dev/null)
BRANCH=$(git -C "$BODHI_DIR" branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
TODAY=$(date '+%Y-%m-%d')

# Build breadcrumb content
CONTENT="Claude Code session ended (${TIMESTAMP}, branch: ${BRANCH}). Last commit: ${LAST_COMMIT}."
if [ -n "$DIFF_STAT" ]; then
  # Summarize uncommitted changes
  CHANGED=$(echo "$DIFF_STAT" | tail -1)
  CONTENT="${CONTENT} Uncommitted: ${CHANGED}"
fi

# Store breadcrumb via API (use jq for safe JSON escaping)
if command -v jq &> /dev/null; then
  PAYLOAD=$(jq -n \
    --arg content "$CONTENT" \
    --arg today "$TODAY" \
    '{content: $content, type: "event", importance: 0.4, tags: ["bodhi", "session-breadcrumb", $today]}')
else
  # Fallback: escape quotes manually
  ESCAPED=$(echo "$CONTENT" | sed 's/"/\\"/g')
  PAYLOAD="{\"content\":\"$ESCAPED\",\"type\":\"event\",\"importance\":0.4,\"tags\":[\"bodhi\",\"session-breadcrumb\",\"$TODAY\"]}"
fi

curl -s --max-time 3 -X POST "$BODHI_URL/api/memories" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1

exit 0
