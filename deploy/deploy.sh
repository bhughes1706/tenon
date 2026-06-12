#!/usr/bin/env bash
# deploy.sh — run from dev machine over Tailscale SSH
# Usage: ./deploy/deploy.sh [mini-canterbury]
set -euo pipefail

HOST="${1:-mini-canterbury}"
TS="$(date -u +%Y%m%dT%H%M%S)"
RELEASE_DIR="/home/brian/releases/$TS"

echo "==> Gate: typecheck + test"
pnpm typecheck
pnpm test

echo "==> Build"
pnpm build

echo "==> Package"
tar czf tenon.tar.gz \
  packages/server/dist/ \
  packages/web/dist/ \
  package.json \
  pnpm-workspace.yaml \
  packages/server/package.json \
  packages/core/package.json \
  packages/web/package.json

echo "==> Ship to $HOST ($RELEASE_DIR)"
ssh "$HOST" "mkdir -p $RELEASE_DIR"
scp tenon.tar.gz "$HOST:$RELEASE_DIR/"

ssh "$HOST" bash -s <<EOF
  set -euo pipefail
  cd "$RELEASE_DIR"
  tar xzf tenon.tar.gz
  rm tenon.tar.gz

  # Install production deps (server only; web is static)
  cd packages/server && npm install --omit=dev --legacy-peer-deps 2>/dev/null || true
  cd /home/brian

  ln -sfn "$RELEASE_DIR" /home/brian/current
  systemctl restart tenon
  sleep 2
  systemctl is-active --quiet tenon && echo "tenon is running" || { echo "tenon failed to start"; journalctl -u tenon -n 30; exit 1; }

  # Prune old releases (keep last 5)
  ls -dt /home/brian/releases/*/ | tail -n +6 | xargs -r rm -rf
EOF

rm -f tenon.tar.gz
echo "==> Deployed $TS"

# ---------------------------------------------------------------------------
# First-time setup on mini-canterbury (run once manually):
#
# 1. Install volta + Node 22:
#    curl https://get.volta.sh | bash
#    volta install node@22
#
# 2. Install pnpm:
#    volta install pnpm@9
#
# 3. Create env file:
#    sudo mkdir -p /etc/tenon
#    sudo tee /etc/tenon/env <<'ENVEOF'
#    PORT=3000
#    DATA_DIR=/home/brian/data
#    MCP_BEARER_TOKEN=$(openssl rand -hex 32)
#    NODE_ENV=production
#    ENVEOF
#
# 4. Install systemd unit:
#    sudo cp deploy/tenon.service /etc/systemd/system/tenon.service
#    sudo systemctl daemon-reload
#    sudo systemctl enable tenon
#
# 5. Tailscale TLS (required for PWA install, camera, service worker):
#    sudo tailscale cert mini-canterbury.<tailnet>.ts.net
#    # Certs land in /etc/ssl/tailscale/ — configure server to use them (chunk 3)
#
# 6. Tailscale Funnel for /mcp (Claude.ai connects from outside the tailnet):
#    tailscale funnel --bg 443
#    # /mcp route requires Bearer token auth (MCP_BEARER_TOKEN) — see chunk 4
#
# 7. REST API stays on tailscale serve (tailnet-only):
#    tailscale serve --bg 3000
# ---------------------------------------------------------------------------
