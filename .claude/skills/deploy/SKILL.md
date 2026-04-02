---
name: deploy
description: Run the full BODHI deploy sequence — build, restart, verify all services.
disable-model-invocation: true
allowed-tools: Bash(npm *), Bash(curl *), Bash(lsof *), Bash(kill *)
---

Run the full deploy sequence:

1. `npm run build` (all packages)
2. Kill any process on port 4000: `lsof -ti:4000 | xargs kill -9`
3. Start server: `npm run dev -w @seneca/server`
4. Wait 5 seconds, then check `http://localhost:4000/api/status`

Report the status of all services.
