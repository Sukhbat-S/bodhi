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
   - **VPS (if local fails):** Run `ssh -i ~/Downloads/"SSH Key Mar 01 2026.key" ubuntu@161.33.186.178 "cd ~/bodhi && docker compose up -d"`
3. Wait 5 seconds, retry `get_bodhi_status`
4. If still unreachable: tell the user explicitly. Do NOT silently fall back to file-based storage. Continue the session without memory context.

## Step 0b: Bridge Auth Check

Test Bridge with a quick ping:
```bash
curl -s -X POST http://localhost:4000/api/chat -H "Content-Type: application/json" -d '{"message":"ping"}' --max-time 15
```

**If error (exit code 1, auth, timeout):**
1. Tell the user: "⚠️ BODHI's brain (Claude CLI) has an expired token. Memory read/write still works, but briefings and AI reasoning are broken."
2. Give the fix commands:
   ```
   claude auth login
   scp ~/.config/claude-code/credentials.json ubuntu@161.33.186.178:~/claude-credentials.json
   ssh ubuntu@161.33.186.178 "docker cp ~/claude-credentials.json bodhi:/root/.config/claude-code/credentials.json && docker restart bodhi"
   ```
3. Don't block — continue to Step 1. Memory loading works without Bridge.

## Step 1: Detect Project

Determine the current project from the working directory:
- `/Users/macbookpro/Documents/bodhi/` → project: "bodhi"
- `/Users/macbookpro/Documents/shigtgee/` → project: "jewelry" or "shigtgee"
- Other paths → ask the user what project they're working on

## Step 2: Load Context

Run these searches in parallel:

1. **Recent session summaries**: `search_memories("session-summary {project}")` — what happened last session
2. **Pending items**: `search_memories("pending {project}")` — what's left to do
3. **Project context**: `get_project_context("{project}")` — key memories for this project
4. **Today's context**: `get_todays_context()` — calendar, emails, BODHI status

## Step 3: Present Briefing

```
BODHI status:
  API: online ✓
  Brain (Bridge): [working ✓ / ⚠️ token expired]

## {Project} — Session Start

**Last session**: [summary of what was accomplished]

**Pending items**:
- item 1
- item 2

**Key context**:
- [2-3 most relevant decisions/patterns for this project]

**Today**: [calendar events, unread emails if relevant]

Ready to go. What are we working on?
```

Keep it brief. The goal is orientation, not information overload.
If BODHI has no memories for this project yet, say so and ask what the user wants to work on.
