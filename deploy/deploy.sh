#!/usr/bin/env bash
# deploy.sh — run from dev machine over Tailscale SSH
# Usage: ./deploy/deploy.sh [mini-canterbury]
set -euo pipefail

HOST="${1:-bhughes@mini-canterbury}"
TS="$(date -u +%Y%m%dT%H%M%S)"

echo "==> Gate: typecheck + test"
corepack pnpm --filter @tenon/core typecheck
corepack pnpm --filter @tenon/server typecheck
corepack pnpm --filter @tenon/web typecheck
corepack pnpm --filter @tenon/core test
corepack pnpm --filter @tenon/server test
corepack pnpm --filter @tenon/web test

echo "==> Build"
corepack pnpm --filter @tenon/core build
corepack pnpm --filter @tenon/server build
corepack pnpm --filter @tenon/web build

echo "==> Stage"
# Create a clean deploy layout that matches the systemd unit:
#   current/server/index.js        <- built server bundle (tsup CJS)
#   current/server/package.json    <- prod deps manifest (workspace dep stripped)
#   current/web/                   <- static PWA files
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/server" "$STAGE/web" "$STAGE/systemd"

cp packages/server/dist/index.js "$STAGE/server/"
cp -r packages/server/dist/migrations "$STAGE/server/"
cp -r packages/web/dist/. "$STAGE/web/"
cp deploy/tenon.service "$STAGE/systemd/"

# Strip the workspace dep (@tenon/core is bundled into index.js by tsup) and devDeps
# so `npm install --omit=dev` on the target only installs native runtime modules.
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('packages/server/package.json', 'utf8'));
  delete pkg.dependencies['@tenon/core'];
  delete pkg.devDependencies;
  delete pkg.scripts;
  fs.writeFileSync('$STAGE/server/package.json', JSON.stringify(pkg, null, 2));
"

echo "==> Package"
tar czf tenon.tar.gz -C "$STAGE" .

echo "==> Ship to $HOST ($TS)"
ssh "$HOST" "mkdir -p ~/releases/$TS"
scp tenon.tar.gz "$HOST:~/releases/$TS/"

ssh -t "$HOST" bash <<REMOTE
set -euo pipefail

cd ~/releases/$TS
tar xzf tenon.tar.gz && rm tenon.tar.gz

# Install prod native deps (express, better-sqlite3, sharp, etc.)
# @tenon/core is already bundled into server/index.js — not needed here.
cd server
/home/bhughes/.volta/bin/npm install --omit=dev
cd ~

# Install systemd service
sudo cp ~/releases/$TS/systemd/tenon.service /etc/systemd/system/tenon.service
sudo systemctl daemon-reload
sudo systemctl enable tenon

ln -sfn ~/releases/$TS ~/current
sudo systemctl restart tenon
sleep 2
sudo systemctl is-active --quiet tenon \
  && echo "tenon running" \
  || { echo "tenon failed to start:"; sudo journalctl -u tenon -n 30; exit 1; }

# Prune old releases, keep last 5
ls -dt ~/releases/*/ | tail -n +6 | xargs -r rm -rf
REMOTE

rm -f tenon.tar.gz
echo "==> Deployed $TS"

# ---------------------------------------------------------------------------
# First-time setup on mini-canterbury (run once manually):
#
# 1. Install volta + Node 22:
#    curl https://get.volta.sh | bash
#    volta install node@22
#
# 2. Create env file:
#    sudo mkdir -p /etc/tenon
#    sudo tee /etc/tenon/env <<'ENVEOF'
#    PORT=3000
#    DATA_DIR=/home/brian/data
#    MCP_BEARER_TOKEN=$(openssl rand -hex 32)
#    NODE_ENV=production
#    ENVEOF
#
# 3. Install systemd unit:
#    sudo cp deploy/tenon.service /etc/systemd/system/tenon.service
#    sudo systemctl daemon-reload
#    sudo systemctl enable tenon
#
# 4. Tailscale TLS (required for PWA install, camera, service worker):
#    sudo tailscale cert mini-canterbury.<tailnet>.ts.net
#    # Certs land at /var/lib/tailscale/certs/ — configure server to use them (chunk 3)
#
# 5. Tailscale Funnel for /mcp (Claude.ai is outside the tailnet):
#    tailscale funnel --bg 443
#    # Bearer auth enforced in server middleware (chunk 4)
#
# 6. REST API stays tailnet-only via tailscale serve:
#    tailscale serve --bg 3000
# ---------------------------------------------------------------------------
