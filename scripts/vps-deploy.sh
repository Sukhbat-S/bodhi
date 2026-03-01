#!/bin/bash
# ============================================================
# BODHI — VPS Deploy (from Mac)
# Tars project, SCPs to VPS, rebuilds Docker
# Usage: ./scripts/vps-deploy.sh
# ============================================================

set -e

VPS_HOST="161.33.186.178"
VPS_USER="ubuntu"
SSH_KEY="$HOME/Downloads/SSH Key Mar 01 2026.key"
REMOTE_DIR="~/bodhi"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Creating deployment archive..."
tar czf /tmp/bodhi-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  --exclude=.turbo \
  --exclude=.DS_Store \
  --exclude=.env \
  --exclude=.google-token.json \
  --exclude='apps/dashboard/dist' \
  .

SIZE=$(ls -lh /tmp/bodhi-deploy.tar.gz | awk '{print $5}')
echo "    Archive: $SIZE"

echo "==> Uploading to VPS..."
scp -i "$SSH_KEY" /tmp/bodhi-deploy.tar.gz "$VPS_USER@$VPS_HOST:~/bodhi-deploy.tar.gz"

echo "==> Extracting and rebuilding on VPS..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
  cd $REMOTE_DIR && \
  tar xzf ~/bodhi-deploy.tar.gz 2>/dev/null && \
  rm ~/bodhi-deploy.tar.gz && \
  docker compose build 2>&1 | tail -3 && \
  docker compose down && \
  docker compose up -d
"

echo "==> Waiting for health check..."
sleep 10

HEALTH=$(curl -sf "http://$VPS_HOST:4000/health" 2>/dev/null || echo '{"status":"failed"}')
echo "==> Health: $HEALTH"

if echo "$HEALTH" | grep -q '"healthy"'; then
  echo "==> BODHI is online on VPS!"
else
  echo "==> WARNING: Health check failed. SSH in and check logs:"
  echo "    ssh -i \"$SSH_KEY\" $VPS_USER@$VPS_HOST \"cd ~/bodhi && docker compose logs --tail=50\""
fi

rm -f /tmp/bodhi-deploy.tar.gz
