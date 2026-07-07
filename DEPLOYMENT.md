# Tenon Deployment Checklist — Mini-Canterbury Setup

**Goal:** Deploy the Tenon server to mini-canterbury and expose it securely via Tailscale.

**Prerequisites:**
- SSH access to mini-canterbury (via Tailscale)
- sudo privileges on mini-canterbury
- Tailscale admin access (for Funnel + serve config)

---

## Phase 1: System Preparation

### 1.1 Install Volta + Node 22

SSH into mini-canterbury and run:

```bash
curl https://get.volta.sh | bash
source ~/.bashrc
volta install node@22
node --version  # should show v22.x.x
```

### 1.2 Create data directory

```bash
mkdir -p ~/data/photos
chmod 755 ~/data
```

This is where SQLite, migrations, and uploaded photos live.

---

## Phase 2: Environment & Service Setup

### 2.1 Create /etc/tenon/env (systemd environment file)

```bash
sudo mkdir -p /etc/tenon
sudo tee /etc/tenon/env > /dev/null <<'ENVEOF'
PORT=3001
DATA_DIR=/home/bhughes/data
MCP_BEARER_TOKEN=$(openssl rand -hex 32)
NODE_ENV=production
ENVEOF
sudo chmod 600 /etc/tenon/env
cat /etc/tenon/env  # verify
```

**Important:** Save the `MCP_BEARER_TOKEN` — you'll need it when configuring Claude.ai MCP tools.

### 2.2 Install systemd unit

```bash
sudo cp deploy/tenon.service /etc/systemd/system/tenon.service
sudo systemctl daemon-reload
sudo systemctl enable tenon
sudo systemctl start tenon
sudo systemctl status tenon
```

Verify status shows "active (running)". Check logs:
```bash
sudo journalctl -u tenon -n 50 -f
```

Should show:
```
INFO: database ready
INFO: tenon server listening on 3001
```

---

## Phase 3: TLS Setup (Required for PWA)

### 3.1 Generate Tailscale certs

```bash
sudo tailscale cert mini-canterbury.<tailnet>.ts.net
```

Replace `<tailnet>` with your actual Tailscale network name. Certs land at `/var/lib/tailscale/certs/`.

Verify:
```bash
ls -l /var/lib/tailscale/certs/
```

You should see:
- `mini-canterbury.<tailnet>.ts.net.crt`
- `mini-canterbury.<tailnet>.ts.net.key`

### 3.2 Configure server to use TLS certs

Edit `/etc/tenon/env` to add:

```bash
HTTPS_CERT=/var/lib/tailscale/certs/mini-canterbury.<tailnet>.ts.net.crt
HTTPS_KEY=/var/lib/tailscale/certs/mini-canterbury.<tailnet>.ts.net.key
```

Then restart:
```bash
sudo systemctl restart tenon
sudo journalctl -u tenon -n 20
```

---

## Phase 4: Tailscale Network Exposure

### 4.1 Enable Tailscale Funnel for /mcp (Claude.ai access)

**Do not use bare port 443** — it already belongs to another app on this box (fuel-tracker calorie app). Scope the funnel to the 8443 HTTPS listener instead:

```bash
tailscale funnel --bg --https=8443 3001
```

The MCP endpoint will be:
```
https://mini-canterbury.<tailnet>.ts.net:8443/mcp
```

Bearer auth is enforced in the server middleware — only requests with the correct `MCP_BEARER_TOKEN` header succeed.

### 4.2 Tenon PWA (tailnet-only)

The PWA itself is not funneled — only `/mcp` is exposed publicly (4.1). The rest of the app is reachable directly over the tailnet at:

```
https://mini-canterbury.<tailnet>.ts.net:8443/
```

Not exposed to the internet.

---

## Phase 5: Deploy the Application

### 5.1 From your dev machine, run the deploy script

```bash
./deploy/deploy.sh
```

(No args needed — defaults to `bhughes@mini-canterbury`.) This will:
1. Typecheck and test locally
2. Build all packages
3. Create a clean tarball (`tenon.tar.gz`)
4. SSH to mini-canterbury and unpack it to `~/releases/<timestamp>`
5. Install production dependencies (`better-sqlite3`, `sharp`, etc.)
6. Symlink `~/releases/<timestamp>` → `~/current`
7. Restart the systemd service
8. Keep last 5 releases, prune older ones

If it succeeds, you'll see:
```
==> Deployed 20260612T234530
```

### 5.2 Verify the deployment

```bash
ssh bhughes@mini-canterbury "systemctl status tenon && echo '---' && curl http://localhost:3001"
```

Should return the HTML from the static web app.

---

## Phase 6: Configure Claude.ai MCP Tools

### 6.1 Get the MCP endpoint and bearer token

From the env file you created:
```bash
ssh bhughes@mini-canterbury "cat /etc/tenon/env | grep -E 'MCP_BEARER_TOKEN|NODE_ENV'"
```

### 6.2 In Claude.ai, add the MCP server

Go to **Settings → Beta features → Claude Extensions (or Model Context Protocol)** and add:

- **Type:** HTTP (Streamable)
- **URL:** `https://mini-canterbury.<tailnet>.ts.net:8443/mcp`
- **Authentication:** Bearer token (paste the token from step 6.1)

### 6.3 Test the MCP tools

In Claude.ai, ask:
```
@tenon what jobs are in the system?
```

Or:
```
Create a new model called "Hall table"
```

If the MCP server is reachable and authenticated, Claude will have access to the tools.

---

## Troubleshooting

### Server won't start
```bash
sudo journalctl -u tenon -n 100
```

Common issues:
- **"already in use"** → Port 3001 is bound. Check with `lsof -i :3001`
- **"Cannot find migrations"** — tsup onSuccess hook didn't copy migrations. Run manually:
  ```bash
  cp -r packages/server/migrations packages/server/dist/migrations
  node packages/server/dist/index.js
  ```

### MCP calls fail with 401
- Bearer token mismatch — re-check the token in `/etc/tenon/env`
- Funnel not enabled — run `tailscale funnel --bg 443`

### PWA won't install on phone
- TLS certs not configured — verify `/var/lib/tailscale/certs/` files exist
- Certs expired — regenerate: `sudo tailscale cert mini-canterbury.<tailnet>.ts.net`

---

## After Deployment: First Test

1. **Add a job from the PWA:**
   - Install on phone via `https://mini-canterbury.<tailnet>.ts.net:8443/` (tailnet-only)
   - Create a job titled "Test Job"

2. **Upload a photo:**
   - Take a photo, upload it via the jobs UI
   - Verify it appears in `~/data/photos/`

3. **Test MCP editing:**
   - In Claude.ai, ask to fetch the job details
   - Ask Claude to log a time entry or add a note
   - Verify changes appear in the PWA

4. **Monitor server health:**
   ```bash
   ssh bhughes@mini-canterbury "tail -f /var/log/syslog | grep tenon"
   ```

---

## Rollback (if needed)

Each deploy creates `~/releases/<timestamp>`. To roll back:

```bash
ssh bhughes@mini-canterbury
ln -sfn ~/releases/<previous-timestamp> ~/current
sudo systemctl restart tenon
```

---

## Notes

- **Data is not backed up yet.** Back up `~/data/` regularly (or set up rsync from your dev machine).
- **Updates:** To deploy a new version, just run `./deploy/deploy.sh` again.
- **Database migrations:** Happen automatically on startup (`initDb()` in `packages/server/src/db.ts`). If you're concerned, take a backup of `~/data/tenon.db` before deploying.
