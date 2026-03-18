---
name: learn
description: Teach BODHI something new — guide the user through storing knowledge.
argument-hint: "[knowledge to remember]"
disable-model-invocation: true
---

Teach BODHI something new — guide the user through storing knowledge.

If the user provided an argument (e.g., `/learn TypeScript generics are covariant`):

1. Parse the knowledge statement
2. Determine the best type:
   - **fact**: observable truth, technical knowledge, codebase info
   - **decision**: a choice made with reasoning
   - **pattern**: recurring behavior, approach, or debugging strategy
   - **preference**: likes, dislikes, values, tool preferences
   - **event**: milestone, deadline, important occurrence
3. Suggest importance (0.1-1.0):
   - 0.3-0.5: nice to know
   - 0.5-0.7: useful reference
   - 0.7-0.9: important to remember
   - 0.9-1.0: critical, never forget
4. Suggest relevant tags
5. Confirm with the user: "I'll store this as a [type] with importance [X] and tags [Y]. OK?"
6. On confirmation, call `store_memory` with the details
7. Confirm: "Got it. BODHI will remember: [content]"

If no argument provided:

1. Ask: "What would you like BODHI to remember?"
2. Then follow steps 2-7 above

This works for anything — technical knowledge, personal preferences, business insights, life observations. BODHI is a personal knowledge system, not just a code tool.
