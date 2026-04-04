# BODHI — Quick Setup

Personal AI companion with long-term memory. See yourself clearly.

## Prerequisites

| Requirement | Install |
|-------------|---------|
| macOS, Linux, or WSL | - |
| Node.js 22+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` |
| Supabase account (free) | [supabase.com/dashboard](https://supabase.com/dashboard) |
| Voyage AI key (free) | [dash.voyageai.com](https://dash.voyageai.com) |
| Telegram account | [telegram.org](https://telegram.org) |

## Setup

```bash
git clone https://github.com/Sukhbat-S/bodhi.git
cd bodhi
bash scripts/setup.sh
```

The setup wizard will walk you through:
1. Checking prerequisites
2. Creating a Supabase project and connecting the database
3. Creating a Telegram bot via @BotFather
4. Configuring your Voyage AI API key
5. Building and starting BODHI

## Before Running Setup

### 1. Authenticate Claude Code

```bash
claude auth login
```

This opens your browser to sign in with your Claude account (Pro or Max plan).

### 2. Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a new project (free tier is fine)
3. Once created, go to **Settings > Database > Connection string > URI**
4. Copy the connection string (you'll paste it during setup)
5. Enable pgvector: go to **SQL Editor**, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Create Telegram Bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow the prompts to name your bot
3. Copy the bot token it gives you
4. To get your user ID: message **@userinfobot** on Telegram

## Verify

```bash
curl http://localhost:4000/health
```

Should return `{"status":"ok"}`.

Open http://localhost:4000 for the dashboard, or message your Telegram bot to start chatting.

## Start / Stop

```bash
bash scripts/start.sh    # Start BODHI
bash scripts/stop.sh     # Stop BODHI
```

## Optional Integrations

Add these to your `.env` file when ready:

| Integration | Env Vars | Purpose |
|-------------|----------|---------|
| Gmail + Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Today's events, unread emails |
| Notion | `NOTION_API_KEY` | Workspace knowledge context |
| GitHub | `GITHUB_TOKEN`, `GITHUB_REPOS` | Commit/PR/issue tracking |
| Vercel | `VERCEL_TOKEN` | Deployment monitoring |
| Voice messages | `GROQ_API_KEY` | Whisper transcription via Groq |
