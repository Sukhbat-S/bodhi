---
name: auto-health
description: Auto health monitoring — when errors occur, server seems down, or Telegram stops responding, automatically check BODHI's health and suggest fixes.
user-invocable: false
allowed-tools: Bash(curl *localhost*)
---

# BODHI Auto Health Check

When you detect signs of service issues (errors, timeouts, "not responding" complaints), run these checks:

## Quick Health Check

```bash
curl -s --max-time 5 http://localhost:4000/api/status
```

If no response → server is down. Suggest:
```bash
cd "$BODHI_DIR" && bash scripts/start.sh
```

## Service-Specific Checks

If server responds but a specific service is failing:

- **Telegram not responding**: Check status field in `/api/status`. If disconnected, likely started without internet. Restart server.
- **Gmail/Calendar errors**: Check if Google OAuth token needs refresh at `/api/google/auth`
- **Memory search failing**: Check Supabase connection. Database may have auto-paused (free tier).
- **Scheduler not firing**: Check `/api/scheduler` for job history and next run times.

## Common Fixes

1. **Server won't start**: Port occupied. `lsof -ti:4000 | xargs kill -9` then restart.
2. **Telegram timeout on startup**: Server started without internet. Wait for connection, restart.
3. **"code exited with code 1"**: Claude CLI auth issue. Check Bridge logs.
4. **Supabase connection timeout**: Free tier auto-paused. Dashboard keeps alive with 3-day ping.

## Recovery Steps

If basic restart doesn't work:
```bash
cd "$BODHI_DIR"
lsof -ti:4000,5173 | xargs kill -9 2>/dev/null
sleep 2
bash scripts/start.sh
```

Verify after restart:
```bash
curl -s http://localhost:4000/api/status | python3 -m json.tool
```
