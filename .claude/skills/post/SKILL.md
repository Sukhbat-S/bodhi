---
name: post
description: Post content to all social platforms (X, Facebook, Instagram) with AI-adapted bilingual versions.
argument-hint: "[content to post]"
user-invocable: true
allowed-tools: Bash(curl *localhost*), mcp__x-twitter__post_tweet, mcp__x-twitter__upload_media
---

Post content across all social platforms with language adaptation (English for X, Mongolian for Facebook/Instagram).

## Flow

### Step 1: Adapt & Post to Facebook/Instagram

Call the BODHI API to adapt content and post to Meta platforms:

```bash
curl -s -X POST http://localhost:4000/api/post \
  -H "Content-Type: application/json" \
  -d '{"content": "$ARGUMENTS"}'
```

If the user provided an image URL, include it:
```bash
curl -s -X POST http://localhost:4000/api/post \
  -H "Content-Type: application/json" \
  -d '{"content": "$ARGUMENTS", "imageUrl": "THE_URL"}'
```

### Step 2: Post to X/Twitter

Read the `adaptedContent.twitter` field from the API response.

Post it using the MCP tool:
- Call `mcp__x-twitter__post_tweet` with the adapted English text.

### Step 3: Report Results

Show a summary:

```
Posted to:
  X/Twitter: [success/fail] — [link or error]
  Facebook:  [success/fail] — [link or error]
  Instagram: [success/fail] — [link or error]

Content:
  EN (X): "adapted text..."
  MN (FB): "adapted text..."
  MN (IG): "adapted text..."
```

## Notes

- If BODHI server is not running, tell the user to start it first.
- Instagram requires an `imageUrl` — if not provided, skip IG and tell the user.
- If Meta is not configured, still post to X and note that FB/IG need setup.
- If `$ARGUMENTS` is empty, ask the user what they want to post.
