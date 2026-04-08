---
name: session-start
description: Load context from BODHI's memory to start a coding session — recent work, pending items, today's schedule.
disable-model-invocation: true
---

Load context from BODHI's memory to start this coding session.

## Step 0: Health Check — Is BODHI alive?

Call `get_bodhi_status` first.

**If BODHI responds:** Check the status fields and note any issues, then continue to Step 0b.

**If BODHI is unreachable:**

1. Tell the user: "BODHI server is not responding. Let me try to wake it up."
2. Try to start it:
   - **Local:** Run `cd ~/Documents/bodhi && bash scripts/start.sh`
   - **VPS (if local fails):** Run `ssh -i "$SSH_KEY" $VPS_USER@$VPS_HOST "cd ~/bodhi && docker compose up -d"`
3. Wait 5 seconds, retry `get_bodhi_status`
4. If still unreachable: tell the user explicitly. Do NOT silently fall back to file-based storage. Continue the session without memory context.

## Step 0b: Bridge Auth Check

Test Bridge with a quick ping:
```bash
curl -s -X POST http://localhost:${BODHI_PORT:-4000}/api/chat -H "Content-Type: application/json" -d '{"message":"ping"}' --max-time 15
```

**If error (exit code 1, auth, timeout):**
1. Tell the user: "⚠️ BODHI's brain (Claude CLI) has an expired token. Memory read/write still works, but briefings and AI reasoning are broken."
2. Give the fix commands:
   ```
   claude auth login
   scp ~/.config/claude-code/credentials.json $VPS_USER@$VPS_HOST:~/claude-credentials.json
   ssh $VPS_USER@$VPS_HOST "docker cp ~/claude-credentials.json bodhi:/root/.config/claude-code/credentials.json && docker restart bodhi"
   ```
3. Don't block — continue to Step 1. Memory loading works without Bridge.

## Step 1: Detect Project

Determine the current project from the working directory:
- `/Users/macbookpro/Documents/bodhi/` → project: "bodhi"
- `/Users/macbookpro/Documents/shigtgee/` → project: "jewelry" or "shigtgee"
- Other paths → ask the user what project they're working on

## Step 1b: Register Active Session

Call `register_active_session` with:
- `project`: the detected project name
- `description`: a short description of the session (e.g., "Dashboard improvements" or "Jewelry platform polish")
- `id`: use a stable identifier like `{project}-{terminal-tab}` so re-running session-start in the same tab updates rather than duplicates

Save the returned session ID so `/session-save` can deregister it later. Store it as: "Active session ID: {id}" in your working context.

Write the session ID to `/tmp/bodhi-session-id` so the heartbeat hook pings the correct session:
```bash
echo "{session-id}" > /tmp/bodhi-session-id
```

## Step 2: Load Context

Run these searches in parallel:

1. **Recent session summaries**: `search_memories("session-summary {project}")` — what happened last session
2. **Pending items**: `search_memories("pending {project}")` — what's left to do
3. **Project context**: `get_project_context("{project}")` — key memories for this project
4. **Today's context**: `get_todays_context()` — calendar, emails, BODHI status
5. **Active sessions**: `get_active_sessions()` — what other tabs are working on
6. **File conflicts**: `check_file_conflicts()` — which files are being edited by other sessions
7. **Session messages**: `get_session_messages()` — any coordination messages from other sessions
8. **Today's briefing**: `curl -s "http://localhost:${BODHI_PORT:-4000}/api/briefings?limit=1"` — show inline if from today
9. **Mission history**: `curl -s "http://localhost:${BODHI_PORT:-4000}/api/missions"` — show recent completed/running missions

## Step 3: Present Briefing

```
BODHI status:
  API: online ✓
  Brain (Bridge): [working ✓ / ⚠️ token expired]

## {Project} — Session Start

**Today's Briefing** (if exists + from today):
[Full briefing content — no truncation. This is the actionable morning plan with tasks.]

**Last session**: [summary of what was accomplished]

**Pending items**:
- item 1
- item 2

**Key context**:
- [2-3 most relevant decisions/patterns for this project]

**Missions**: [running/completed mission count, or "none"]
**Other active sessions**: [list any parallel sessions, or "none"]
**File conflicts**: [warn if another session is editing files you might touch]

Ready to go. What are we working on?
```

Keep it brief. The goal is orientation, not information overload.
If BODHI has no memories for this project yet, say so and ask what the user wants to work on.
