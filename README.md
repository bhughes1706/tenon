# Tenon

Parametric woodworking design and job management for Canterbury Woodworking. Self-hosted on a shop PC, single user.

Jobs, photos, time tracking, and hardware purchasing live in one place. The designer lets you build a piece parametrically — boards, joints, species — and evaluates the geometry in a web worker so you see real mortises, dadoes, and rabbets carved in 3D. Claude can drive the designer directly through an MCP server.

---

## What's built

| Area | Details |
|---|---|
| **Job management** | Status tracking, due dates, client association, payment/deposit fields |
| **Photo feed** | Upload from phone or desktop, EXIF extraction, thumbnail generation, per-job feed |
| **Time & notes** | Categorised time logs and freeform notes per job |
| **Hardware list** | Per-job purchasing list |
| **3D designer** | R3F viewport, orbit/select/measure modes, transform gizmo, species colors |
| **Snapping** | Face/edge/end magnetic snap against other boards; Alt suspends |
| **Joints** | Housing, rabbet, half-lap, butt, bridle, mortise & tenon — schema + preconditions + geometry evaluator |
| **Geometry evaluator** | Manifold WASM carve pipeline in a web worker; board-local carves, flat-normal mesh, per-face provenance |
| **Collision lint** | Analytic AABB pass on every model mutation; server-authoritative on op commit |
| **Command palette** | `⌘K` from anywhere; context menu on right-click in the viewport |
| **Outliner** | Collapsible board/group tree with multi-select grouping |
| **MCP server** | Claude can `apply_model_ops`, `get_model`, `list_jobs`, `get_job`, log time/notes, and fetch photos |
| **PWA** | Service worker, offline-first for `/api/*`, installable |

---

## Stack

**Web** — React 18, TypeScript, Vite, Tailwind v4, React Three Fiber, Zustand, Radix UI, React Router v7, manifold-3d 3.5.1 (WASM, worker-only)

**Server** — Node 22, Express 5, better-sqlite3 (WAL), sharp, tsup CJS bundle, Streamable HTTP MCP

**Core** — Isomorphic TypeScript (no DOM, no Node-only APIs); `@tenon/core/eval` subpath pulls WASM (worker + tests only — server bundle stays WASM-free)

**Infra** — Self-hosted Ubuntu mini PC, Tailscale, systemd, pnpm monorepo

---

## Monorepo layout

```
packages/
  core/     shared types, Zod schemas, op validators, analytic geometry, WASM eval pipeline
  server/   Express API + SQLite + photo pipeline + MCP server
  web/      React 18 PWA (Vite, R3F, Tailwind v4)
deploy/
  deploy.sh        build + scp + systemd restart
  tenon.service    systemd unit
docs/
  chunk8-design.md  snapping / collision / outliner design decisions
  chunk9-design.md  geometry evaluator design decisions
```

---

## Development

**Requirements:** Node ≥ 22, pnpm via corepack (`corepack enable`).

```bash
# Install deps
corepack pnpm install

# Build core first (web + server depend on its dist/)
corepack pnpm --filter @tenon/core build

# Type-check everything
corepack pnpm --filter @tenon/core typecheck
corepack pnpm --filter @tenon/server typecheck
corepack pnpm --filter @tenon/web typecheck

# Tests
corepack pnpm --filter @tenon/core test    # 117 tests (analytic geometry + evaluator + memo)
corepack pnpm --filter @tenon/server test  # 16 tests
corepack pnpm --filter @tenon/web test     # 65 tests
```

**Run locally:**

```bash
# Terminal 1 — API server (must use built bundle — tsx hits an ESM export error)
corepack pnpm --filter @tenon/server build
DATA_DIR="$PWD/data" PORT=3000 NODE_ENV=development node packages/server/dist/index.js

# Terminal 2 — Vite dev server (proxies /api → :3000)
corepack pnpm --filter @tenon/web dev
```

Create a model to open in the designer (no UI create flow yet):

```bash
MID=$(curl -s -X POST http://localhost:3000/api/models \
  -H 'Content-Type: application/json' -d '{"name":"Test"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
open "http://localhost:5173/designer/$MID"
```

---

## Deploy

```bash
./deploy/deploy.sh
```

Builds all three packages, scps to `bhughes@mini-canterbury`, runs `npm install --omit=dev` for native modules, symlinks the release, and restarts `tenon.service`. Keeps the last five releases for rollback.

**Rollback:**
```bash
ssh bhughes@mini-canterbury
ln -sfn ~/releases/<previous-timestamp> ~/current
sudo systemctl restart tenon
```

Tenon runs on port **3001**. Port 3000 is Grafana — don't touch it.

---

## MCP access

The MCP server is at `https://mini-canterbury.tail66a67a.ts.net:8443/mcp` (Tailnet only for the PWA; MCP endpoint is public with bearer auth). Set `Authorization: Bearer <token>` — token is in `/etc/tenon/env` on the server.

Available tools: `list_jobs`, `get_job`, `create_job`, `update_job`, `log_note`, `log_time`, `list_photos`, `get_photo`, `apply_model_ops`, `get_model`.

---

## Key design decisions

- **Board-local carves** — geometry is evaluated in each board's local frame (box at origin); the R3F `<group>` holds the world transform. This keeps the gizmo, snapping, and collision paths untouched when the carve source changes.
- **Per-board carve memo** — because a board's local mesh is a pure function of its dims + cutter boxes, the worker caches it per board and reskips the Manifold carve when nothing about that board changed. A full re-eval at the worst-case ceiling (96 boards / 192 joints) is ~28 ms; a one-board edit ~3.5 ms.
- **Server stays WASM-free** — `manifold-3d` is in `@tenon/core/eval` (subpath export, worker + tests only). The server imports base `@tenon/core` and uses analytic AABB geometry for collision and joint preconditions — exact for v1's 90°-multiple rotations.
- **Warning authority** — the client runs an analytic collision pass for instant optimistic lint; the server's pass is authoritative and its result replaces the client's on `ok`.
- **`manifold-3d` is exact-pinned** at `3.5.1` (no caret). Don't bump without regenerating the golden test snapshots.
- **`corepack pnpm`**, not bare `pnpm` — the dev Mac's default Node is v20; corepack shims aren't in PATH without it.

---

## Spec

The authoritative spec is `/Users/Brian/Downloads/tenon-spec-v0.4.md`. Section numbers in source comments (e.g. `§5.6`) refer to it. Design mini-specs for individual chunks live in `docs/`.
