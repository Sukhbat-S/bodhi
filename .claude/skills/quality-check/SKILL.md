---
name: quality-check
description: Analyze BODHI memory quality — duplicates, stale items, confidence distribution. Manual trigger only.
disable-model-invocation: true
allowed-tools: mcp__bodhi__search_memories, mcp__bodhi__get_memory_stats, mcp__bodhi__get_insights
---

Analyze BODHI's memory quality and report a health score.

## Step 1: Gather Data

Run these in parallel:
1. `get_memory_stats()` — total counts, type distribution
2. `get_insights()` — stale decisions, neglected areas, activity patterns
3. `search_memories("session-summary")` — recent session summaries (limit 5)
4. `search_memories("pending")` — any stuck pending items

## Step 2: Check for Issues

!`curl -s localhost:4000/api/memories/quality 2>/dev/null | head -c 1000 || echo "Quality endpoint unavailable"`

Flag:
- **Duplicates**: memories with >0.92 similarity that weren't caught by nightly synthesis
- **Stale items**: pending items older than 14 days that should be archived or confirmed
- **Low confidence**: memories with confidence < 0.3 that are polluting retrieval
- **Type imbalance**: too many events vs too few decisions/patterns (events decay, decisions persist)

## Step 3: Report

```
Memory Quality Score: [A/B/C/D/F]

Stats: [total] memories ([confirmed]/[pending])
Types: [facts] facts, [decisions] decisions, [patterns] patterns, [events] events

Issues Found:
- [list each issue with count and severity]

Recommendations:
- [specific actions: archive X, run synthesis, adjust decay thresholds]
```

Score guide:
- A: <5% stale, no duplicates, balanced types
- B: 5-15% stale or minor imbalance
- C: 15-30% stale or duplicates found
- D: >30% stale or significant quality issues
- F: Memory system needs manual intervention
