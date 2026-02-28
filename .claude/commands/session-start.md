Load context from BODHI's memory to start this coding session.

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

Format a concise "Here's where you left off" summary:

```
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
