#!/bin/bash
# ============================================================
# BODHI Voice — Talk to BODHI with your voice
#
# Records audio → transcribes via Groq Whisper → sends to BODHI
# chat → speaks the response via macOS TTS
#
# Usage:
#   bash scripts/voice.sh              # Record, transcribe, chat, speak
#   bash scripts/voice.sh --briefing   # Speak the morning briefing
#
# Bind to a keyboard shortcut in macOS System Settings for
# hands-free activation. For clap detection, see scripts/clap.sh
# ============================================================

set -e

BODHI_URL="${BODHI_URL:-http://localhost:4000}"
VOICE="${BODHI_VOICE:-Samantha}"  # macOS voice (try: Alex, Samantha, Daniel)
RECORD_SECONDS="${BODHI_RECORD_SECONDS:-5}"
TMP_DIR="/tmp/bodhi-voice"
mkdir -p "$TMP_DIR"

# Check if BODHI is running
if ! curl -s "$BODHI_URL/health" > /dev/null 2>&1; then
  say -v "$VOICE" "BODHI is not running. Start the server first."
  exit 1
fi

# --- Morning Briefing Mode ---
if [[ "$1" == "--briefing" ]]; then
  say -v "$VOICE" "Good morning. Let me check what's happening today."

  RESPONSE=$(curl -s -X POST "$BODHI_URL/api/scheduler/trigger" \
    -H "Content-Type: application/json" \
    -d '{"type":"morning"}' --max-time 30)

  CONTENT=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
text = d.get('content', d.get('briefing', d.get('message', 'No briefing available.')))
# Strip markdown for speech
import re
text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
text = re.sub(r'\*([^*]+)\*', r'\1', text)
text = re.sub(r'#{1,3}\s*', '', text)
text = re.sub(r'- ', '', text)
print(text)
" 2>/dev/null || echo "Could not generate briefing.")

  say -v "$VOICE" "$CONTENT"
  exit 0
fi

# --- Voice Chat Mode ---

# Record audio
AUDIO_FILE="$TMP_DIR/recording.wav"
echo "Listening for $RECORD_SECONDS seconds..."
say -v "$VOICE" -r 200 "I'm listening."

# Record using macOS sox or ffmpeg
if command -v sox &> /dev/null; then
  sox -d -r 16000 -c 1 "$AUDIO_FILE" trim 0 "$RECORD_SECONDS" 2>/dev/null
elif command -v ffmpeg &> /dev/null; then
  ffmpeg -f avfoundation -i ":0" -t "$RECORD_SECONDS" -ar 16000 -ac 1 -y "$AUDIO_FILE" 2>/dev/null
else
  # Fallback: use macOS afrecord
  afrecord -d 'LEI16' -c 1 -r 16000 -f 'WAVE' "$AUDIO_FILE" &
  RECORD_PID=$!
  sleep "$RECORD_SECONDS"
  kill "$RECORD_PID" 2>/dev/null
fi

echo "Processing..."

# Transcribe via Groq Whisper (through BODHI's transcription or direct)
# First try BODHI's endpoint if it exists, otherwise use Groq directly
GROQ_KEY=$(grep "^GROQ_API_KEY=" "$HOME/Documents/bodhi/.env" 2>/dev/null | cut -d= -f2)

if [[ -n "$GROQ_KEY" ]]; then
  TRANSCRIPT=$(curl -s "https://api.groq.com/openai/v1/audio/transcriptions" \
    -H "Authorization: Bearer $GROQ_KEY" \
    -F "file=@$AUDIO_FILE" \
    -F "model=whisper-large-v3" \
    -F "language=en" | python3 -c "import sys,json; print(json.load(sys.stdin).get('text',''))" 2>/dev/null)
else
  say -v "$VOICE" "Groq API key not found. Add GROQ_API_KEY to your .env file."
  exit 1
fi

if [[ -z "$TRANSCRIPT" ]]; then
  say -v "$VOICE" "I couldn't understand that. Try again."
  exit 1
fi

echo "You said: $TRANSCRIPT"

# Send to BODHI chat
RESPONSE=$(curl -s -X POST "$BODHI_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$TRANSCRIPT\"}" --max-time 30)

REPLY=$(echo "$RESPONSE" | python3 -c "
import sys, json, re
d = json.load(sys.stdin)
text = d.get('content', 'No response.')
# Strip markdown for speech
text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
text = re.sub(r'\*([^*]+)\*', r'\1', text)
text = re.sub(r'#{1,3}\s*', '', text)
text = re.sub(r'- ', '', text)
text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # Remove links
# Trim for speech (max ~500 chars)
if len(text) > 500:
    text = text[:497] + '...'
print(text)
" 2>/dev/null || echo "Something went wrong.")

echo "BODHI: $REPLY"
say -v "$VOICE" "$REPLY"

# Cleanup
rm -f "$AUDIO_FILE"
