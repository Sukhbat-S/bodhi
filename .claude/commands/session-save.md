Analyze the ENTIRE session transcript and extract knowledge for BODHI's long-term memory.

## Step 1: Identify Context

Determine:
- **Project**: What project was worked on (from file paths, topics, cwd)
- **Session scope**: What was the goal of this session

## Step 2: Deduplicate

Search BODHI's existing memories to avoid storing duplicates:
- Call `search_memories` with the project name + main topic
- Call `search_memories` with 1-2 key technical terms from the session

Note what BODHI already knows. Only extract NEW information below.

## Step 3: Extract Memories

Review the full session and extract items in these categories. Be selective — quality over quantity. Each memory must be a standalone, self-contained statement.

### Technical Facts (type: "fact", importance: 0.5-0.8)
- Library behaviors, API quirks, config discoveries
- Build/deploy patterns that worked
- Codebase knowledge (file locations, data flow, architecture)
- Tags: [project, "technical", specific-technology]

### Decisions + Rationale (type: "decision", importance: 0.7-0.9)
- What was chosen AND why
- What alternatives were considered and rejected
- Tags: [project, "architecture" or "design" or "tooling"]

### Debugging Patterns (type: "pattern", importance: 0.6-0.9)
- "When X happens, the cause is usually Y"
- Diagnostic approaches that worked
- Error messages and their root causes
- Tags: [project, "debugging", specific-technology]

### Personal Insights (type: "preference", importance: 0.6-0.8)
- User preferences observed (tool choices, communication style, approach)
- Productivity patterns (what works, what doesn't)
- Learning moments — new skills or concepts understood
- Tags: ["personal", relevant-subtag]

### Session State (type: "event", importance: 0.7-0.9)
- What was accomplished (concrete deliverables)
- What is pending or blocked for next session
- Tags: [project, "session"]

### Meta-Observations (type: "pattern", importance: 0.5-0.7)
- Session effectiveness observations
- Approach quality — what went well, what could improve
- Cross-session patterns (links to previous work)
- Tags: ["meta", project]

### Life / Business Insights (type: "preference" or "fact", importance: 0.6-0.8)
- Any non-code insights that came up during conversation
- Business strategy, goals, values expressed
- Tags: ["personal", relevant-subtag]

## Step 4: Store Everything

Call `store_session_summary` with:
- **project**: detected project name
- **completed**: list of completed items
- **pending**: list of pending items for next session
- **memories**: all extracted memories from Step 3
- **sessionNote**: one-sentence summary of the session

This stores everything in one efficient batch call.

## Step 5: Report

Tell the user:
```
Session saved: X memories stored (Y facts, Z decisions, W patterns, ...)
Pending items for next session:
- item 1
- item 2
```

## Rules

- Only extract genuinely valuable knowledge. Skip trivial actions (file reads, routine edits).
- Each memory must be self-contained — readable without session context.
- Minimum importance threshold: 0.4. Don't store low-value observations.
- If nothing worth remembering happened, say so. Don't force extraction.
- ALWAYS check for duplicates in Step 2 before storing.
