---
name: health-report
description: Full BODHI system health report — checks all services, memory stats, recent errors. Runs in forked context.
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Bash(curl *localhost*)
---

# BODHI Health Report

Generate a comprehensive health report for all BODHI services.

## Service Status

!`curl -s --max-time 5 http://localhost:4000/api/status 2>/dev/null || echo '{"error": "Server not responding"}'`

## Memory Stats

!`curl -s --max-time 5 http://localhost:4000/api/memories/stats 2>/dev/null || echo '{"error": "Cannot reach memory API"}'`

## Gmail Status

!`curl -s --max-time 5 http://localhost:4000/api/gmail/status 2>/dev/null || echo '{"error": "Cannot reach Gmail API"}'`

## Calendar Status

!`curl -s --max-time 5 http://localhost:4000/api/calendar/status 2>/dev/null || echo '{"error": "Cannot reach Calendar API"}'`

## GitHub Status

!`curl -s --max-time 5 http://localhost:4000/api/github/status 2>/dev/null || echo '{"error": "Cannot reach GitHub API"}'`

## Scheduler Status

!`curl -s --max-time 5 http://localhost:4000/api/scheduler 2>/dev/null || echo '{"error": "Cannot reach Scheduler API"}'`

## Instructions

1. Parse all the service data above
2. Check each service for:
   - Is it online/connected?
   - Any error states?
   - Any concerning metrics (high memory count with low quality, stale data, etc.)?
3. Generate a formatted health report

## Output Format

```
## BODHI Health Report

**Overall**: [HEALTHY / DEGRADED / DOWN]
**Timestamp**: [current time]

### Services
| Service | Status | Details |
|---------|--------|---------|
| API Server | ... | ... |
| Telegram | ... | ... |
| Gmail | ... | ... |
| Calendar | ... | ... |
| GitHub | ... | ... |
| Vercel | ... | ... |
| Supabase | ... | ... |
| Memory | ... | X memories, Y avg importance |
| Scheduler | ... | Next run: ... |

### Alerts
- [any issues needing attention]

### Recommendations
- [suggested actions if any]
```
