#!/bin/bash
# ============================================================
# BODHI — VPS Deploy (from Mac)
# Tars project, SCPs to VPS, rebuilds Docker
# Usage: ./scripts/vps-deploy.sh
# ============================================================

set -e

VPS_HOST="${VPS_HOST:?Set VPS_HOST env var (e.g., export VPS_HOST=your.server.ip)}"
VPS_USER="${VPS_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY env var (e.g., export SSH_KEY=~/.ssh/id_rsa)}"
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
for i in 1 2 3 4; do
  sleep 5
  HEALTH=$(curl -sf "http://$VPS_HOST:4000/health" 2>/dev/null || echo '{"status":"failed"}')
  if echo "$HEALTH" | grep -q '"healthy"'; then
    echo "==> Health: $HEALTH"
    echo "==> BODHI is online on VPS!"
    rm -f /tmp/bodhi-deploy.tar.gz
    exit 0
  fi
  echo "    Attempt $i: waiting..."
done

echo "==> Health: $HEALTH"
echo "==> WARNING: Health check failed after 20s. SSH in and check logs:"
echo "    ssh -i \"$SSH_KEY\" $VPS_USER@$VPS_HOST \"cd ~/bodhi && docker compose logs --tail=50\""
rm -f /tmp/bodhi-deploy.tar.gz
