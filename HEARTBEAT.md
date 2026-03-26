# BODHI HEARTBEAT TASKS

> **Interval**: Every 30 minutes via cron
> **Notify via**: Telegram (BODHI bot at localhost:4000)
> **Timezone**: Asia/Ulaanbaatar (UTC+8)

You are BODHI's autonomous health monitor. Read the current time and check each applicable section below. For any issues found, send a Telegram notification via the BODHI API.

## How to Alert

Send alerts via BODHI's chat API (which forwards to Telegram):
```bash
curl -s -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "HEARTBEAT ALERT: [description of issue]"}'
```

## Always Run (Every 30 Minutes)

- [ ] **Server health**: `curl -s --max-time 10 http://localhost:4000/api/status`. If not responding or any service shows "offline"/"disconnected", alert via Telegram.
- [ ] **Telegram connection**: Check the `telegram` field in status response. If "disconnected" or missing, alert: "Telegram bot is disconnected. Server may need restart."
- [ ] **Database reachable**: Check if memory API responds: `curl -s --max-time 10 http://localhost:4000/api/memories/stats`. If timeout or error, alert: "Supabase database may be unreachable."

## Morning (8:00-8:30 AM Mongolia time, weekdays only)

- [ ] **Morning briefing**: Trigger via `curl -s -X POST http://localhost:4000/api/scheduler/trigger -H "Content-Type: application/json" -d '{"type":"morning"}'`
- [ ] **Unread emails**: Check `curl -s http://localhost:4000/api/gmail/unread`. If count > 20, include count in morning alert.
- [ ] **Today's calendar**: Check `curl -s http://localhost:4000/api/calendar/today`. Send formatted schedule to Telegram if there are events.

## Evening (20:00-20:30 PM Mongolia time, weekdays only)

- [ ] **Evening briefing**: Trigger via `curl -s -X POST http://localhost:4000/api/scheduler/trigger -H "Content-Type: application/json" -d '{"type":"evening"}'`
- [ ] **Pending items**: Search BODHI's memory for recent pending items: `curl -s "http://localhost:4000/api/memories/search?q=pending&limit=5"`. Summarize any outstanding work.

## Weekly (Monday 9:00-9:30 AM Mongolia time)

- [ ] **Weekly briefing**: Trigger via `curl -s -X POST http://localhost:4000/api/scheduler/trigger -H "Content-Type: application/json" -d '{"type":"weekly"}'`
- [ ] **Memory quality**: Check `curl -s http://localhost:4000/api/memories/quality`. Report stale memory count and any tags trending down.
- [ ] **GitHub PRs**: Check `curl -s http://localhost:4000/api/github/prs`. Alert if there are open PRs needing review.

## Daily (12:00 Noon Mongolia time)

- [ ] **Jewelry platform quality check**: Run quality metrics on the jewelry platform:
  ```bash
  cd /Users/macbookpro/Documents/jewelry-platform && bash scripts/quality-check.sh --json
  ```
  Compare against `scripts/quality-baseline.json`. Alert via Telegram if:
  - `any_count` increased by 5+ since baseline
  - `big_files` increased (new files crossing 500 lines)
  - `tsc_passes` is false (types broken)
  Format alert as: "📊 Code quality alert: [metric] regressed from X to Y. Check recent commits."

## Rules

1. **Silent when healthy**: If all checks pass, log "HEARTBEAT_OK" and exit silently. Do NOT send Telegram messages when everything is fine.
2. **Alert only on issues**: Only send Telegram notifications when something needs attention.
3. **Be concise**: Keep alert messages to 1-2 sentences. Include the service name and what's wrong.
4. **Don't retry**: If a service is down, alert once. The next heartbeat cycle will check again.
5. **Time-gated tasks**: Only run morning/evening/weekly tasks during their specified windows. Skip if outside the window.
