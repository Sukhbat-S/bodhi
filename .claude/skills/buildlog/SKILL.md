---
name: buildlog
description: Generate a build-in-public post from recent git commits and session memories
argument-hint: "[time range or topic, e.g. 'this week' or 'entity graph']"
user-invocable: true
allowed-tools: Bash(curl *localhost*), mcp__x-twitter__post_tweet
---

Generate a "build in public" post from BODHI's own data — recent git commits, session memories, and decisions.

## Flow

### Step 1: Generate the build log

Call the BODHI API to generate content from recent activity:

```bash
curl -s -X POST http://localhost:4000/api/content/buildlog \
  -H "Content-Type: application/json" \
  -d '{"days": 7, "topic": "$ARGUMENTS"}'
```

If `$ARGUMENTS` contains a number (e.g., "3 days"), use that as `days`.
If `$ARGUMENTS` is empty, default to `{"days": 7}`.

### Step 2: Present the draft

Show the generated tweets to the user:

```
Build Log Draft:

Tweet 1: "..."
Tweet 2: "..." (if thread)

Based on: X commits, Y memories

Want to post this to X? (yes/edit/cancel)
```

### Step 3: Post to X

If the user approves, post using MCP:
- For a single tweet: call `mcp__x-twitter__post_tweet` with the text
- For a thread: post the first tweet, then reply to it with subsequent tweets

### Step 4: Report

```
Posted to X:
  Tweet: [link]
  Content: "..."
```

## Notes

- If BODHI server is not running, tell the user to start it first.
- If `$ARGUMENTS` is empty, generate from the last 7 days of activity.
- Always let the user review and edit before posting.
- The API uses Bridge (Claude) to transform raw git/memory data into engaging content.
