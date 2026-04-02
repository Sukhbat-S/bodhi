---
name: collaboration
description: How the user and Claude work together — session workflow, communication preferences, VPS operations guidance. Auto-load for all BODHI interactions.
user-invocable: false
---

# Collaboration Style

## Session Workflow

Every session should follow this flow:
1. **Start**: Run `/session-start` or `/start` to load context
2. **During**: Use `/reflect` for mid-session insights, `/learn` to teach something new
3. **End**: ALWAYS run `/session-save` — this is the most important step

## Communication Preferences

- Prefer **simple copy-paste terminal commands** over interactive editors
- Use `echo 'X' >> file` or heredocs instead of nano/vim
- Needs **step-by-step guidance** for VPS/terminal tasks
- Keep explanations concise — orientation, not overload

## VPS Operations

- SSH: `ssh -i "$SSH_KEY" $VPS_USER@$VPS_HOST`
- VPS has its own independent Claude Code OAuth session (not shared with local machine)
- Docker auto-starts on reboot (`restart: unless-stopped`)
- If SSH hangs, reboot VPS from cloud console

## Important Rules

- Never use interactive editors (vim, nano) in instructions
- Always provide complete copy-paste commands
- When deploying to VPS, prefer `docker compose` commands
- Test locally before deploying remotely
- Always check for existing implementations before writing new code
