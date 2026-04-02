---
name: reflect
description: Mid-session reflection — pause and capture insights before they're forgotten.
disable-model-invocation: true
---

Mid-session reflection — pause and capture insights before they're forgotten.

Review the session transcript so far and identify:

1. **What's working** — approaches, tools, or patterns proving effective
2. **What's blocking** — challenges, friction points, dead ends
3. **Patterns noticed** — technical or personal (debugging habits, energy, focus)
4. **Decisions made** — choices worth recording for future reference
5. **Discoveries** — anything surprising or non-obvious learned

For each insight worth remembering (be selective — 2-5 items max), call `store_memory` immediately with:
- Appropriate type: `pattern`, `decision`, `fact`, or `preference`
- Importance: 0.5-0.8
- Tags: include project name and relevant categories

After storing, report:
```
Captured X reflections:
- [one-line summary of each]
```

This is a quick checkpoint, not a full session-save. Keep it brief.
If there's nothing notable yet, say "Nothing worth capturing yet — keep going."
