#!/bin/bash
# ============================================================
# BODHI — Deploy Script
# Pulls latest, builds, restarts, and verifies health
# Usage: ./scripts/deploy.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Pulling latest changes..."
git pull

echo "==> Building Docker image..."
docker compose build

echo "==> Restarting BODHI..."
docker compose down
docker compose up -d

echo "==> Waiting for health check..."
sleep 5

HEALTH=$(curl -sf http://localhost:4000/health 2>/dev/null || echo '{"status":"failed"}')
echo "==> Health: $HEALTH"

if echo "$HEALTH" | grep -q '"healthy"'; then
  echo "==> BODHI is online!"
else
  echo "==> WARNING: Health check failed. Check logs:"
  echo "    docker compose logs --tail=50"
fi
