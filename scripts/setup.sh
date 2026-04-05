#!/bin/bash
# ============================================================
# BODHI — First-Time Setup
# Interactive setup wizard for new BODHI installations
# ============================================================

set -e

echo ""
echo "  BODHI - Personal AI Companion"
echo "  First-time setup"
echo "  ─────────────────────────────"
echo ""

# Check prerequisites
check_prereq() {
  if ! command -v "$1" &> /dev/null; then
    echo "  [!] $1 is not installed. $2"
    return 1
  fi
  echo "  [ok] $1"
  return 0
}

echo "Checking prerequisites..."
echo ""

MISSING=0
check_prereq "node" "Install from https://nodejs.org (v22+ recommended)" || MISSING=1
check_prereq "npm" "Comes with Node.js" || MISSING=1
check_prereq "git" "Install from https://git-scm.com" || MISSING=1

# Check Node version
if command -v node &> /dev/null; then
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 20 ]; then
    echo "  [!] Node.js v20+ required (you have v$NODE_VER)"
    MISSING=1
  fi
fi

echo ""

if [ "$MISSING" -eq 1 ]; then
  echo "Please install the missing prerequisites and run this script again."
  exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ""
  echo "  .env created. You need to fill in at minimum:"
  echo ""
  echo "  1. TELEGRAM_BOT_TOKEN     - Create a bot via @BotFather on Telegram"
  echo "  2. TELEGRAM_ALLOWED_USER_ID - Your Telegram user ID"
  echo "  3. DATABASE_URL           - PostgreSQL with pgvector (Supabase free tier works)"
  echo "  4. VOYAGE_API_KEY         - Get at https://dash.voyageai.com/"
  echo ""

  read -p "  Open .env in your editor now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    ${EDITOR:-nano} .env
  fi
else
  echo ".env already exists, skipping..."
fi

echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

echo ""

# Build all packages
echo "Building all packages..."
npm run build

echo ""

# Check if database is reachable
echo "Checking database connection..."
if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
  DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2-)
  if [ -n "$DB_URL" ] && [ "$DB_URL" != "postgresql://postgres:password@db.xxx.supabase.co:6543/postgres" ]; then
    echo "  [ok] DATABASE_URL is configured"
  else
    echo "  [!] DATABASE_URL is not configured. Set it in .env before starting."
  fi
else
  echo "  [!] DATABASE_URL not found in .env"
fi

echo ""
echo "  ─────────────────────────────"
echo "  Setup complete!"
echo ""
echo "  To start BODHI:"
echo "    bash scripts/start.sh"
echo ""
echo "  To start in dev mode (with hot reload):"
echo "    bash scripts/start.sh --dev"
echo ""
echo "  Dashboard: http://localhost:4000"
echo "  API:       http://localhost:4000/api/status"
echo "  About:     http://localhost:4000/about"
echo "  ─────────────────────────────"
echo ""
