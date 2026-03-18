---
name: recall
description: Search BODHI's memory for past decisions, patterns, facts, and preferences. Use when the user asks about something discussed in previous sessions.
argument-hint: "[search query]"
---

Search BODHI's memory for: $ARGUMENTS

Call `search_memories` with query "$ARGUMENTS" and limit 10.

Present results cleanly:
```
Found X memories:
1. [type] Content (similarity%, date) [tags]
2. [type] Content (similarity%, date) [tags]
...
```

If no argument provided, ask: "What are you looking for?"
If no results found, suggest alternative search terms based on the query.
