---
name: start
description: Start a new BODHI session — ensure the server is running, then load context from memory.
disable-model-invocation: true
allowed-tools: Bash(curl *), Bash(bash *), Bash(lsof *)
---

Start a new BODHI session: ensure the server is running, then load context.

## Step 1: Check if BODHI Server is Running

Run this command to check:
```
curl -s --max-time 3 http://localhost:4000/api/status
```

- If it responds → server is running, skip to Step 3
- If it fails/times out → server is NOT running, go to Step 2

## Step 2: Start BODHI Server

Run the start script (single server — API + Dashboard on :4000):
```
cd "$BODHI_DIR" && bash scripts/start.sh
```

Wait for "BODHI Running" output. If it fails, try:
```
lsof -ti:4000 | xargs kill -9 2>/dev/null; sleep 1 && cd "$BODHI_DIR" && bash scripts/start.sh
```

Verify it's up:
```
curl -s http://localhost:4000/api/status | python3 -m json.tool
```

If still failing, report the error and stop.

Note: For development with hot reload, use `bash scripts/start.sh --dev` (adds Vite on :5173).

## Step 3: Load Session Context

Now that the server is running, do the full session-start flow:

Run these searches in parallel:

1. **Recent session summaries**: `search_memories("session-summary")` — what happened last session
2. **Pending items**: `search_memories("pending")` — what's left to do
3. **Project context**: `get_project_context("bodhi")` — key memories
4. **Today's context**: `get_todays_context()` — calendar, emails, BODHI status

## Step 4: Present Briefing

Format a concise summary:

```
## BODHI — Session Start

**Server**: Running on :4000 (API + Dashboard)

**Last session**: [summary of what was accomplished]

**Pending items**:
- item 1
- item 2

**Key context**:
- [2-3 most relevant decisions/patterns]

**Today**: [calendar events, unread emails if relevant]

Ready to go. What are we working on?
```

Keep it brief — orientation, not overload.
