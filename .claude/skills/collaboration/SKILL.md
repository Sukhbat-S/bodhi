---
name: collaboration
description: How Sukhbat and Claude work together — session workflow, communication preferences, VPS operations guidance. Auto-load for all BODHI interactions.
user-invocable: false
---

# Collaboration Style — Sukhbat + Claude

## Session Workflow

Every session should follow this flow:
1. **Start**: Run `/session-start` or `/start` to load context
2. **During**: Use `/reflect` for mid-session insights, `/learn` to teach something new
3. **End**: ALWAYS run `/session-save` — this is the most important step

## Communication Preferences

- Sukhbat prefers **simple copy-paste terminal commands** over interactive editors
- Not comfortable with nano/vim — use `echo 'X' >> file` or heredocs instead
- Needs **step-by-step guidance** for VPS/terminal tasks
- Keep explanations concise — orientation, not overload
- Can communicate in both English and Mongolian

## VPS Operations

- SSH: `ssh -i "$SSH_KEY" $VPS_USER@$VPS_HOST` (set VPS_HOST, VPS_USER, SSH_KEY env vars)
- VPS has its own independent Claude Code OAuth session (not shared with local machine)
- Docker auto-starts on reboot (`restart: unless-stopped`)
- If SSH hangs, reboot VPS from cloud console

## Important Rules

- Never use interactive editors (vim, nano) in instructions
- Always provide complete copy-paste commands
- When deploying to VPS, prefer `docker compose` commands
- Test locally before deploying remotely
- Always check for existing implementations before writing new code
