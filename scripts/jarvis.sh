#!/bin/bash
# ============================================================
# BODHI Jarvis — Clap-Activated Voice Assistant
#
# Double-clap to activate → speak → BODHI responds → continue
# conversation → 30s silence returns to listening mode
#
# Usage:
#   bash scripts/jarvis.sh
#
# Requirements: sox (brew install sox), GROQ_API_KEY in .env
# ============================================================

BODHI_URL="${BODHI_URL:-http://localhost:4000}"
VOICE="${BODHI_VOICE:-Samantha}"
TMP_DIR="/tmp/bodhi-jarvis"
GROQ_KEY=$(grep "^GROQ_API_KEY=" "$HOME/Documents/bodhi/.env" 2>/dev/null | cut -d= -f2)
THREAD_ID=""
CLAP_THRESHOLD="${BODHI_CLAP_THRESHOLD:-0.4}"
FOLLOW_UP_TIMEOUT=20  # seconds to wait for follow-up before returning to idle

mkdir -p "$TMP_DIR"

# Colors
AMBER='\033[0;33m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
BOLD='\033[1m'
RESET='\033[0m'

# ---- Preflight ----

if ! command -v sox &>/dev/null; then
  echo "sox not found. Install: brew install sox"
  exit 1
fi

if [[ -z "$GROQ_KEY" ]]; then
  echo "GROQ_API_KEY not found in .env"
  exit 1
fi

if ! curl -s "$BODHI_URL/api/status" > /dev/null 2>&1; then
  echo "BODHI server not running at $BODHI_URL"
  exit 1
fi

# ---- Functions ----

strip_markdown() {
  python3 -c "
import sys, re
text = sys.stdin.read().strip()
if not text:
    print('No response.')
    sys.exit(0)
text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
text = re.sub(r'\*([^*]+)\*', r'\1', text)
text = re.sub(r'#{1,3}\s*', '', text)
text = re.sub(r'^- ', '', text, flags=re.MULTILINE)
text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
text = re.sub(r'\`[^\`]+\`', '', text)
text = re.sub(r'\n{3,}', '\n\n', text)
if len(text) > 800:
    text = text[:797] + '...'
print(text.strip())
"
}

transcribe() {
  local audio_file="$1"
  curl -s "https://api.groq.com/openai/v1/audio/transcriptions" \
    -H "Authorization: Bearer $GROQ_KEY" \
    -F "file=@$audio_file" \
    -F "model=whisper-large-v3" \
    -F "language=en" | python3 -c "import sys,json; print(json.load(sys.stdin).get('text',''))" 2>/dev/null
}

chat() {
  local message="$1"

  # Build JSON safely via Python (handles quotes, newlines, unicode)
  local body
  body=$(python3 -c "
import json, sys
msg = sys.stdin.read().strip()
d = {'message': msg}
tid = '$THREAD_ID'
if tid:
    d['threadId'] = tid
print(json.dumps(d))
" <<< "$message")

  local response
  response=$(curl -s -X POST "$BODHI_URL/api/chat" \
    -H "Content-Type: application/json" \
    -d "$body" --max-time 60)

  if [[ -z "$response" ]]; then
    echo "No response from BODHI."
    return
  fi

  # Extract threadId and content safely
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    tid = d.get('threadId', '')
    content = d.get('content', 'No response.')
    # Write threadId to file for shell to pick up
    if tid:
        open('/tmp/bodhi-jarvis/thread_id', 'w').write(tid)
    print(content)
except:
    print('Something went wrong.')
" <<< "$response"

  # Pick up threadId from file
  if [[ -f "$TMP_DIR/thread_id" ]]; then
    THREAD_ID=$(cat "$TMP_DIR/thread_id")
  fi
}

speak() {
  local text="$1"
  echo -e "${GREEN}BODHI:${RESET} $text"
  # Mute mic input while speaking (prevents hearing own voice)
  osascript -e 'set volume input volume 0' 2>/dev/null
  # Speak in background — press Enter to interrupt
  say -v "$VOICE" -r 180 "$text" &
  SAY_PID=$!
  # Wait for speech to finish OR user to press Enter
  while kill -0 $SAY_PID 2>/dev/null; do
    if read -t 0.3 -n 1 2>/dev/null; then
      kill $SAY_PID 2>/dev/null
      echo -e "${DIM}(interrupted)${RESET}"
      break
    fi
  done
  SAY_PID=""
  # Restore mic after speaking
  osascript -e 'set volume input volume 80' 2>/dev/null
}

interrupt() {
  # Kill speech if running
  if [[ -n "$SAY_PID" ]]; then
    kill $SAY_PID 2>/dev/null
    SAY_PID=""
    osascript -e 'set volume input volume 80' 2>/dev/null
  fi
}

SAY_PID=""

play_chime() {
  afplay /System/Library/Sounds/Tink.aiff 2>/dev/null &
}

play_deactivate() {
  afplay /System/Library/Sounds/Pop.aiff 2>/dev/null &
}

record_speech() {
  local output="$1"
  # Record until 2 seconds of silence, max 30 seconds
  rec "$output" rate 16k channels 1 \
    silence 1 0.3 1% 1 2.0 1% \
    trim 0 30 2>/dev/null
}

detect_double_clap() {
  # Record 3 seconds of audio, look for two loud peaks
  local clip="$TMP_DIR/clap_listen.wav"

  while true; do
    # Record 3 seconds continuously
    rec "$clip" rate 16k channels 1 trim 0 3 2>/dev/null

    # Use Python to analyze the audio for double-clap pattern
    local result
    result=$(python3 << 'PYEOF'
import struct, sys, os

filepath = "/tmp/bodhi-jarvis/clap_listen.wav"
threshold = float(os.environ.get("BODHI_CLAP_THRESHOLD", "0.4"))

try:
    with open(filepath, "rb") as f:
        # Skip WAV header (44 bytes)
        f.read(44)
        data = f.read()

    # Parse 16-bit samples
    samples = struct.unpack(f"<{len(data)//2}h", data[:len(data)//2*2])

    # Normalize to 0-1
    peak = max(abs(s) for s in samples) / 32768.0 if samples else 0

    # Find clap events: amplitude spikes above threshold
    chunk_size = 1600  # 0.1s at 16kHz
    clap_times = []

    for i in range(0, len(samples) - chunk_size, chunk_size):
        chunk = samples[i:i+chunk_size]
        chunk_peak = max(abs(s) for s in chunk) / 32768.0
        if chunk_peak > threshold:
            time_s = i / 16000.0
            # Don't count if too close to previous clap (< 0.2s)
            if not clap_times or (time_s - clap_times[-1]) > 0.2:
                clap_times.append(time_s)

    # Double clap: exactly 2 peaks within 1.5s of each other
    if len(clap_times) >= 2:
        for i in range(len(clap_times) - 1):
            gap = clap_times[i+1] - clap_times[i]
            if 0.2 < gap < 1.5:
                print("CLAP")
                sys.exit(0)

    print("NONE")
except Exception as e:
    print("NONE")
PYEOF
)

    if [[ "$result" == "CLAP" ]]; then
      rm -f "$clip"
      return 0
    fi
  done
}

# ---- Main Loop ----

clear
echo -e "${BOLD}${AMBER}"
echo "  ____   ___  ____  _   _ ___"
echo " | __ ) / _ \|  _ \| | | |_ _|"
echo " |  _ \| | | | | | | |_| || |"
echo " | |_) | |_| | |_| |  _  || |"
echo " |____/ \___/|____/|_| |_|___|"
echo -e "${RESET}"
echo -e "${AMBER}  Jarvis Mode — Double-clap to activate${RESET}"
echo -e "${DIM}  Voice: $VOICE | Server: $BODHI_URL${RESET}"
echo -e "${DIM}  Clap threshold: $CLAP_THRESHOLD (adjust with BODHI_CLAP_THRESHOLD)${RESET}"
echo ""

trap 'echo -e "\n${DIM}Jarvis signing off.${RESET}"; osascript -e "set volume input volume 80" 2>/dev/null; interrupt; rm -rf "$TMP_DIR"; exit 0' INT

while true; do
  echo -e "${DIM}Listening for claps...${RESET}"

  # Wait for double clap
  detect_double_clap

  # Activated! — random greeting + context-aware action
  play_chime
  echo -e "\n${AMBER}Activated!${RESET} Listening..."

  # Get time-aware greeting
  activation_msg=$(python3 << 'PYEOF'
import random, datetime, os
os.environ.setdefault('TZ', 'Asia/Ulaanbaatar')
hour = datetime.datetime.now().hour

if hour < 6:
    greetings = ["Burning late.", "Night owl mode.", "I'm here."]
elif hour < 12:
    greetings = ["Good morning.", "Morning. What's the plan?", "I'm here. Ready to go."]
elif hour < 18:
    greetings = ["I'm here.", "What do you need?", "Go ahead.", "Listening."]
else:
    greetings = ["Evening.", "I'm here.", "Still going?", "What's on your mind?"]

print(random.choice(greetings))
PYEOF
)

  say -v "$VOICE" -r 190 "$activation_msg" &

  # Conversation loop
  while true; do
    # Record speech
    audio_file="$TMP_DIR/speech.wav"
    record_speech "$audio_file"

    # Check if we got any audio (file > 1KB)
    fsize=$(wc -c < "$audio_file" 2>/dev/null | tr -d ' ')
    if [[ -z "$fsize" ]] || [[ "$fsize" -lt 1000 ]]; then
      echo -e "${DIM}No speech detected. Returning to idle.${RESET}"
      play_deactivate
      THREAD_ID=""
      break
    fi

    # Transcribe
    echo -e "${DIM}Transcribing...${RESET}"
    transcript=$(transcribe "$audio_file")
    rm -f "$audio_file"

    if [[ -z "$transcript" ]] || [[ "$transcript" == " " ]]; then
      echo -e "${DIM}Couldn't understand. Returning to idle.${RESET}"
      play_deactivate
      THREAD_ID=""
      break
    fi

    echo -e "${BOLD}You:${RESET} $transcript"

    # Check for exit phrases
    if echo "$transcript" | grep -qi "goodbye\|bye bodhi\|stop\|that's all\|nevermind"; then
      speak "See you later."
      play_deactivate
      THREAD_ID=""
      break
    fi

    # --- Quick commands (bypass AI, hit API directly) ---

    # Status check
    if echo "$transcript" | grep -qi "^status$\|system status\|how.*you doing\|are you alive"; then
      echo -e "${DIM}Checking status...${RESET}"
      status_text=$(curl -s "$BODHI_URL/api/status" | python3 -c "
import sys, json
d = json.load(sys.stdin)
services = []
for k in ['memory','gmail','calendar','github','telegram','notion']:
    v = d.get(k, 'off')
    if v in ('active','connected','running','configured'):
        services.append(k)
up = int(d.get('uptime',0))
hrs = up // 3600
mins = (up % 3600) // 60
print(f'Online for {hrs} hours {mins} minutes. {len(services)} services connected: {\", \".join(services)}.')
" 2>/dev/null)
      speak "$status_text"
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Schedule / calendar
    if echo "$transcript" | grep -qi "schedule\|calendar\|what.*today\|what's on.*today\|my day"; then
      echo -e "${DIM}Checking calendar...${RESET}"
      cal_text=$(curl -s "$BODHI_URL/api/calendar/today" | python3 -c "
import sys, json
d = json.load(sys.stdin)
events = d.get('events', [])
if not events:
    print('No events on your calendar today. You have a free day.')
else:
    lines = [f'{e.get(\"startTime\",\"\")} {e.get(\"summary\",\"\")}' for e in events[:5]]
    print(f'You have {len(events)} events today. ' + '. '.join(lines))
" 2>/dev/null)
      speak "$cal_text"
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Inbox / email
    if echo "$transcript" | grep -qi "inbox\|email\|mail\|unread"; then
      echo -e "${DIM}Checking inbox...${RESET}"
      inbox_text=$(curl -s "$BODHI_URL/api/gmail/unread" | python3 -c "
import sys, json
d = json.load(sys.stdin)
emails = d.get('emails', d.get('messages', []))
if not emails:
    print('Inbox is clear. No unread emails.')
else:
    count = len(emails)
    top = emails[:3]
    subjects = [e.get('subject','No subject') for e in top]
    print(f'{count} unread emails. Top ones: ' + '. '.join(subjects))
" 2>/dev/null)
      speak "$inbox_text"
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Morning briefing
    if echo "$transcript" | grep -qi "briefing\|morning brief\|brief me\|what did i miss"; then
      speak "Generating your briefing. This takes a moment."
      echo -e "${DIM}Running morning briefing...${RESET}"
      brief_text=$(curl -s -X POST "$BODHI_URL/api/scheduler/trigger" \
        -H "Content-Type: application/json" \
        -d '{"type":"morning"}' --max-time 120 | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('content', 'Could not generate briefing.'))
" 2>/dev/null)
      spoken=$(echo "$brief_text" | strip_markdown)
      speak "$spoken"
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Goals
    if echo "$transcript" | grep -qi "^goals$\|my goals\|what.*working on\|priorities"; then
      echo -e "${DIM}Fetching goals...${RESET}"
      goals_text=$(curl -s "$BODHI_URL/api/memories/search?q=active+goals+current+focus&limit=5" | python3 -c "
import sys, json
d = json.load(sys.stdin)
mems = [m for m in d.get('memories', []) if m.get('type') == 'goal']
if not mems:
    mems = d.get('memories', [])[:3]
if not mems:
    print('No active goals found.')
else:
    lines = [m.get('content','') for m in mems[:4]]
    print('Your current focus: ' + '. '.join(lines))
" 2>/dev/null)
      speak "$goals_text"
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Play music on YouTube
    if echo "$transcript" | grep -qi "play.*music\|play.*youtube\|play.*song\|put on some music"; then
      # Extract what to play, or ask
      query=$(echo "$transcript" | python3 -c "
import sys, re
t = sys.stdin.read().strip().lower()
# Remove trigger phrases
for p in ['play', 'on youtube', 'some music', 'put on', 'play me', 'can you play']:
    t = t.replace(p, '')
t = t.strip()
print(t if t and len(t) > 2 else '')
")
      if [[ -z "$query" ]]; then
        speak "What do you want to listen to?"
        record_speech "$TMP_DIR/speech.wav"
        query=$(transcribe "$TMP_DIR/speech.wav")
        rm -f "$TMP_DIR/speech.wav"
      fi
      if [[ -n "$query" ]]; then
        speak "Playing $query on YouTube."
        # URL encode and open in browser
        encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))")
        open "https://www.youtube.com/results?search_query=$encoded"
        sleep 2
        # Click first video via AppleScript
        osascript -e 'tell application "System Events" to key code 36' 2>/dev/null  # Enter key
      fi
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Open app or website
    if echo "$transcript" | grep -qi "^open \|launch \|start "; then
      target=$(echo "$transcript" | sed -E 's/^(open|launch|start) //i' | xargs)
      case "$(echo "$target" | tr '[:upper:]' '[:lower:]')" in
        telegram) open -a Telegram; speak "Opening Telegram." ;;
        slack) open -a Slack; speak "Opening Slack." ;;
        figma) open "https://figma.com"; speak "Opening Figma." ;;
        github) open "https://github.com"; speak "Opening GitHub." ;;
        twitter|x) open "https://x.com"; speak "Opening X." ;;
        youtube) open "https://youtube.com"; speak "Opening YouTube." ;;
        messenger|facebook) open "https://messenger.com"; speak "Opening Messenger." ;;
        spotify) open -a Spotify; speak "Opening Spotify." ;;
        arc|browser) open -a Arc; speak "Opening Arc." ;;
        vs*code|code) open -a "Visual Studio Code"; speak "Opening VS Code." ;;
        terminal) open -a Terminal; speak "Opening Terminal." ;;
        dashboard|bodhi) open "http://localhost:4000"; speak "Opening BODHI dashboard." ;;
        *) open "https://www.google.com/search?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$target'))")"; speak "Searching for $target." ;;
      esac
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Volume control
    if echo "$transcript" | grep -qi "volume up\|louder\|turn it up"; then
      osascript -e 'set volume output volume ((output volume of (get volume settings)) + 15)'
      speak "Volume up."
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi
    if echo "$transcript" | grep -qi "volume down\|quieter\|turn it down"; then
      osascript -e 'set volume output volume ((output volume of (get volume settings)) - 15)'
      speak "Volume down."
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi
    if echo "$transcript" | grep -qi "^mute$\|mute.*sound\|silence"; then
      osascript -e 'set volume with output muted'
      echo -e "${GREEN}BODHI:${RESET} Muted."
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Screenshot
    if echo "$transcript" | grep -qi "screenshot\|take a picture\|capture screen"; then
      screencapture -x "$HOME/Desktop/bodhi-screenshot-$(date +%s).png"
      speak "Screenshot saved to desktop."
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Do not disturb
    if echo "$transcript" | grep -qi "do not disturb\|focus mode\|don't disturb"; then
      shortcuts run "Focus" 2>/dev/null || osascript -e 'do shell script "defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean true && killall NotificationCenter" ' 2>/dev/null
      speak "Focus mode on."
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # Timer
    if echo "$transcript" | grep -qi "set.*timer\|remind me in\|timer for"; then
      minutes=$(echo "$transcript" | python3 -c "
import sys, re
t = sys.stdin.read()
m = re.search(r'(\d+)\s*(minute|min|m)', t, re.I)
if m: print(m.group(1))
else: print('5')
")
      speak "Timer set for $minutes minutes."
      (sleep $((minutes * 60)) && say -v "$VOICE" "Time's up. Your $minutes minute timer is done." && afplay /System/Library/Sounds/Glass.aiff) &
      echo -e "\n${DIM}Listening for follow-up...${RESET}"
      continue
    fi

    # --- Default: send to BODHI AI ---
    echo -e "${DIM}Thinking...${RESET}"
    reply=$(chat "$transcript")

    # Speak response
    spoken=$(echo "$reply" | strip_markdown)
    speak "$spoken"

    echo -e "\n${DIM}Listening for follow-up... (say 'goodbye' to exit)${RESET}"
  done

  echo ""
done
