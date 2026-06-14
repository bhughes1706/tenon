# Tenon — Agent Handoff Document

**Date:** 2026-06-13  
**Repo:** https://github.com/bhughes1706/tenon  
**Spec:** `/Users/Brian/Downloads/tenon-spec-v0.4.md` (always load this — it is the ground truth)

---

## What This Project Is

Parametric woodworking design and job-management app for Canterbury Woodworking. Single user. Self-hosted on a mini PC. The owner uses it to track jobs/photos/time and (eventually) design wooden pieces parametrically with Claude editing the model via MCP.

Key properties:
- **Single user.** No multi-tenancy, no RBAC.
- **Self-hosted.** Tailscale for network access. Not a cloud product.
- **Spec is the authority.** Section numbers in comments (e.g. `§16.6`) refer to the spec file. Read the relevant section before touching anything it governs.

---

## Runtime Environment

| Location | Detail |
|---|---|
| Server | `bhughes@mini-canterbury` (Ubuntu, SSH via Tailscale) |
| Tenon port | **3001** (port 3000 is Grafana — do not use it) |
| Deployed from | Dev Mac via `./deploy/deploy.sh` (no args needed — defaults to `bhughes@mini-canterbury`) |
| Deploy layout | `~/current/server/index.js` + `~/current/web/` — symlinked from `~/releases/<timestamp>/` |
| Systemd | `tenon.service` — auto-restarts, enabled on boot |
| Env file | `/etc/tenon/env` — root-owned (needs sudo to read/write). Contains `PORT=3001`, `DATA_DIR=/home/bhughes/data`, `MCP_BEARER_TOKEN`, `NODE_ENV=production` |
| Data | `~/data/tenon.db` (SQLite WAL), `~/data/photos/` |

### Tailscale Funnel config (current)

```
https://mini-canterbury.tail66a67a.ts.net/        → port 3100 (fuel-tracker calorie app) [PUBLIC]
https://mini-canterbury.tail66a67a.ts.net/mcp     → port 3101 (calorie app MCP)           [PUBLIC]
https://mini-canterbury.tail66a67a.ts.net:8443/   → port 3001 (Tenon PWA)                [TAILNET ONLY]
https://mini-canterbury.tail66a67a.ts.net:8443/mcp → port 3001 (Tenon MCP)               [PUBLIC — bearer auth]
```

**Do not touch port 443 routing** — it belongs to the calorie app (fuel-tracker at `~/fuel-tracker/`).

---

## Monorepo Layout

```
packages/
  core/     — shared types, zod schemas, op validators, ID generators
  server/   — Express API + SQLite + photo pipeline + MCP server
  web/      — React 18 PWA (Vite, Tailwind v4, R3F in chunk 7)
deploy/
  deploy.sh        — build + scp + systemd restart script
  tenon.service    — systemd unit (User=bhughes, volta node path)
DEPLOYMENT.md      — first-time mini-PC setup reference
```

**Package manager:** pnpm via corepack. Always use `corepack pnpm` — bare `pnpm` is not in PATH on the dev Mac.

**Build commands (run from repo root or inside the package dir):**
```bash
corepack pnpm --filter @tenon/core typecheck
corepack pnpm --filter @tenon/server typecheck
corepack pnpm --filter @tenon/web typecheck
corepack pnpm --filter @tenon/core test      # 46 tests
corepack pnpm --filter @tenon/server test    # 16 tests
corepack pnpm --filter @tenon/web test       # 50 tests (jsdom)
./deploy/deploy.sh                           # full build + deploy to mini-canterbury
```

---

## What Is Built (Chunks 1–7 complete)

### `@tenon/core`

- `src/ids.ts` — prefixed nanoid generators: `makeJobId()`, `makeBrdId()`, etc.
- `src/board.ts`, `src/joint.ts`, `src/model.ts` — TypeScript types for `Board`, `Joint`, `ModelDoc`
- `src/ops.ts` — op union type (add_board, update_board, delete_board, add_joint, etc.)
- `src/validators.ts` — zod schemas + `validateOp()` — **46 tests** covering batch validation, strict schemas, typed param patches
- `src/settings.ts` — `Settings` type mirrored in `@tenon/server`
- `src/command.ts`, `src/common.ts`, `src/hardware.ts` — supporting types

Core has **no DOM, no Node-only APIs** — runs identically in browser worker and Node.

### `@tenon/server`

**Database** (`src/db.ts`):
- SQLite WAL mode, `foreign_keys = ON`
- Forward-only migration runner keyed on `PRAGMA user_version`
- VACUUM backup before first pending migration
- Migrations at `migrations/001_init.sql` (copied to `dist/migrations/` at build time)

**Schema** (from `001_init.sql`): `species` (seeded with 16 entries), `clients`, `jobs`, `models`, `model_snapshots`, `boards`, `joints`, `hardware`, `photos`, `notes`, `time_logs`, `settings` (single-row), `schema_version`

**Routes** (all under `/api/`):
- `clients`, `jobs`, `models`, `settings`, `species`, `time_logs`, `notes`, `events` (SSE), `photos`, `hardware`
- Photos: upload via `multer` → `sharp` thumbnails → EXIF extraction → SQLite metadata
- SSE at `/api/events` — clients subscribe; server pushes `model_changed`, `photo_added`, `photo_deleted`, `job_updated`

**MCP server** (`src/mcp/server.ts`):
- Transport: Streamable HTTP (`@modelcontextprotocol/sdk`)
- Tools implemented: `list_jobs`, `get_job`, `create_job`, `update_job`, `log_note`, `log_time`, `list_photos`, `get_photo` (returns base64 thumbnail), `apply_model_ops`, `get_model`
- `apply_model_ops` runs `validateOp()` from core then persists via `src/lib/applyOps.ts`; emits SSE `model_changed` after commit
- All writes appended to `~/data/mcp-audit.log` (pino NDJSON)
- Rate limited: 60 req/min global cap (Tailscale proxies to localhost so req.ip is always 127.0.0.1)
- Auth: `src/middleware/bearerAuth.ts` — reads `Authorization: Bearer <token>`, compares to `MCP_BEARER_TOKEN` env var with timing-safe compare

**Static file serving** (`src/index.ts` L84-90):
- Serves `../web/` (relative to `dist/server/index.js` → `dist/web/`) via `express.static`
- SPA fallback: `app.get('/{*path}')` returns `index.html` (Express 5 wildcard syntax — `'*'` is invalid in Express 5)
- Registered **after** `/api` and `/mcp` routes so those are never shadowed

**Build:** tsup CJS bundle → `dist/index.js` (66 KB). `@tenon/core` is bundled in (noExternal). Native deps (`better-sqlite3`, `sharp`, `express`) stay external, installed on target via npm.

### `@tenon/web`

**Stack:** React 18, TypeScript, Vite, Tailwind v4 (CSS-first, `@theme` block), Radix UI primitives, Lucide React icons, React Router v7, react-three-fiber (not yet wired — chunk 7).

**Design token system** (`src/styles/`):
- `tokens.css` — Layer 1 primitives (`:root` CSS vars: `--gray-*`, `--oak-*`, spacing, type scale, radii, motion) + Layer 2 semantic aliases (`[data-theme="light"]`, `[data-theme="dark"]` blocks) + Layer 3 component tokens
- `index.css` — Tailwind v4 `@theme` block (Layer 1 as Tailwind utilities) + `html:not([data-theme])` fallback for JS-blocked state (scoped to avoid cascade conflict with theme blocks — **critical: must NOT be `:root` or it wins over `[data-theme]` at equal specificity**)
- `--ease-out: cubic-bezier(0,0,0.2,1)` — decelerate curve (NOT `0.2,0,0,1` which is ease-in)
- Duration aliases: `--dur-fast`/`--dur-base` in tokens.css aliased to `--duration-fast`/`--duration-base` for Tailwind v4 bridge

**Theme system** (`src/lib/theme.ts`):
- `applyTheme(theme, density)` — sets `data-theme` and `data-density` on `<html>`, calls `syncViewportTheme()`
- `listenSystemTheme()` — attaches `matchMedia` listener for `system` mode; replaces previous listener on re-call
- `parseStoredTheme(raw)` / `parseStoredDensity(raw)` — validated parse (rejects garbage, returns safe default) — **must be used when reading localStorage**, never bare `as ThemeValue` casts
- `initTheme()` — called at bootstrap in `main.tsx` to avoid FOUC

**Settings hook** (`src/hooks/useSettings.ts`):
- Seeds from `localStorage` immediately (avoids flash), then fetches from `/api/settings`
- Cancellation flag on initial fetch (unmount race guard)
- Optimistic update + rollback on `patchSettings` failure
- `prev` snapshot captured before optimistic apply — known limitation: two concurrent un-awaited calls both capture same prev (acceptable for settings panel)

**Command registry** (`src/lib/registry.ts`):
- `CommandRegistry` class — `register()`, `execute()`, `filtered(ctx, query?)`
- Global singleton `registry` — registered at module load
- Built-in commands: nav (jobs/models/settings), new_job, toggle_theme, toggle_density
- Stub commands (chunk 7 overwrites with real implementations): select, add_board, measure, undo, redo, joint, toggle_outliner, toggle_lint, toggle_cutlist, view_iso, view_front, view_top
- `AppCtx` interface: `{ navigate, settings, updateSettings }` — chunk 7 extends with `selection`, `mode`, `scene`

**Router** (`src/router.tsx`):
- Routes: `/jobs` (JobsBoard), `/jobs/:id` (JobDetail), `/models` (ModelsPage), `/settings` (SettingsPage), `/designer/:modelId` (DesignerPage — stub), `/capture` (stub)
- Desktop: `AppTopbar` + content area
- Mobile (`<768px`): `PhoneTabBar` (Jobs/Models/Capture/Settings tabs)
- `⌘K` / `Ctrl+K` opens `CommandPalette` from any route

**Pages built:**
- `JobsBoard` — sidebar status filter, job list with status/due date, NewJobDialog (create via API), `?new=1` URL param wired to ⌘K "New Job" command
- `JobDetail` — tabs: Overview (status/payment dropdowns, deposit, due date, client), Photos (grid view + upload), Hardware (add/delete items), Feed (notes + time logs with category)
- `ModelsPage` — list models, link to `/designer/:modelId`
- `SettingsPage` — Appearance (theme/density SegmentedControl), Designer, Business sections
- `DesignerPage` — renders `DesignerShell` (placeholder viewport — **chunk 7 replaces this**)

**`syncViewportTheme`** (`src/lib/syncViewportTheme.ts`):
- Reads `--vp-*` CSS tokens via `getComputedStyle`, applies to `ViewportScene` interface
- Scene is `undefined` until chunk 7 wires the R3F scene — function is a no-op until then

**PWA:** VitePWA, `autoUpdate`, service worker precaches all assets, `NetworkFirst` for `/api/*` with 10s timeout

**Tests:** 50 tests — `theme.test.ts` (19), `useSettings.test.ts` (8), plus chunk 7: `fraction.test.ts` (12), `clientOps.test.ts` (8 — applyOpsLocal + invertOps round-trips), `speciesColors.test.ts` (3)

### `@tenon/web` — Chunk 7 (viewport)

**3D viewport** (`src/viewport/`):
- `Viewport.tsx` — R3F `<Canvas>`: orbit controls (drei `OrbitControls makeDefault`), board meshes (flat species color), selection/hover edge outlines, drei `TransformControls` gizmo (translate/rotate, G/R), point-to-point Measure, drei `Line`/`Html` readouts. Camera view presets (iso/front/top) frame model bounds.
- `viewportResources.ts` — all theme-driven WebGL objects (grid major/minor `LineSegments`, overlay materials, scene background `Color`) assembled into the `ViewportScene` that `syncViewportTheme` (§20.3) drives. Wood/species colors are **not** here — physical, never themed.
- `bounds.ts` — world AABB of all boards for camera framing.

**Model store** (`src/lib/modelStore.ts` — Zustand): model load, **optimistic** op dispatch (applies locally, POSTs, reconciles on returned rev), undo/redo via inverse-op stacks, selection/mode/gizmoMode/panel state, snap grid, view requests, SSE subscription. Remote `model_changed` (rev ahead of ours) refetches and **clears undo history** (§3.3) with a toast.

**Client ops** (`src/lib/clientOps.ts`): `applyOpsLocal` is a **faithful twin of the server `applyOps`** (keep in lock-step) for optimistic application; `invertOps` computes undo ops. The UI supplies explicit ids on every add (core id generators) so optimistic and server ids never disagree — no temp-id reconciliation.

**Supporting:** `modelApi.ts` (fetch model / POST ops), `fraction.ts` (decimal↔fractional inches, §2.1), `speciesColors.ts` (flat per-species color + warm fallback), `speciesApi.ts` (cached species list + `useSpecies`). UI: `Inspector.tsx` (board dims/species/transform/lock/delete), `AddBoardDialog.tsx` (numeric-first), `InchInput.tsx` (fractional input).

**Command registry:** `viewportCommands.ts` overwrites the registry stubs with real store-backed impls (select/add/measure/undo/redo/delete/joint/view presets/panel toggles), gated on `ctx.scene !== null` (non-null only while the viewport is mounted). Imported for its side effect in `main.tsx`. `AppCtx` now carries `selection`/`mode`/`scene`, populated by `AppContextProvider` from the store.

**`DesignerShell` is the sole `CommandPalette` host** in the designer — it owns the palette state and handles ⌘K via its keydown handler. Do not add another palette instance in router or any designer child. The rail's search button and the ⌘K shortcut both open the same instance.

**Code-split:** the designer route is `React.lazy`-loaded (`router.tsx`) so three.js/R3F (~934 KB) is a separate chunk — the jobs/photos PWA stays ~398 KB.

---

## What Is NOT Built Yet (Remaining Chunks)

| Chunk | What | Depends on |
|---|---|---|
| ~~7~~ | ~~Viewport: R3F scene, orbit, board render, transform gizmo, Select/Add/Measure modes~~ | **DONE** |
| **8** | **Snapping (face/edge magnetism), collision broadphase, outliner panel (basic version shipped in 7), context menu** | 7 — **NEXT CHUNK** |
| 9 | Manifold WASM geometry evaluator in web worker; joint evaluation pipeline; housing/rabbet/half-lap/M&T/box/dovetail | 7 |
| 10 | Cut list (board → rough stock → waste factors), species cost, materials summary | 9 |
| 11 | Joint dialog + lint resolve flow; `render_view` MCP tool | 9 |
| 12 | Photo capture tab (camera API, phone-first) | 6 |
| 13 | Bid engine (materials + hardware + labor + overhead + margin), `estimate_bid` MCP tool | 10 |
| 14–18 | Settings screen full impl, 3D print export (3MF), co-designer polish, doc migrations | various |

**Phase boundary:** Chunks 1–6 = Phase 1 ("Foundation") — the spec's survival milestone. Jobs/photos/MCP is a complete usable product. **Chunk 7 begins Phase 2 ("Assembly").**

---

## Chunk 8 Entry Conditions (What the Next Agent Needs to Know)

Chunk 8 = snapping (face/edge/end magnetism), collision broadphase, outliner polish, right-click context menu. Assigned to **Opus 4.8** (judgment-heavy UX).

**Where the hooks already are:**
- **Snapping** plugs into the gizmo drag in `src/viewport/Viewport.tsx`. The gizmo currently grid-snaps via `TransformControls translationSnap={snapGrid}`. Magnetic snapping needs an `onObjectChange`/drag handler that adjusts the dragged object toward nearby board faces/edges before commit. `store.snapGrid` is the grid setting; add magnetism on top.
- **Collision broadphase** belongs in the geometry layer (chunk 9 evaluator) but a cheap AABB pass can feed `store.warnings` now. The lint panel (`DesignerShell.tsx` `LintList`) and the rail badge already render `store.warnings` (`Warning[]` from core); just populate it. The `UNRESOLVED_COLLISION` code exists in `@tenon/core` `common.ts`.
- **Outliner** — a basic flat board list already ships in `DesignerShell.tsx` (`Outliner`). Chunk 8 adds groups/tree + drag.
- **Context menu** — Radix `@radix-ui/react-context-menu` is installed. Wire it over the viewport + outliner, filtered by `registry.filtered(ctx)` per §19.3.

**Store is the integration point:** `src/lib/modelStore.ts` (Zustand singleton) holds model/selection/mode/etc. Commands read it via `useModelStore.getState()`. New commands go in `src/lib/viewportCommands.ts`.

**Dependencies already installed:** `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `zustand`.

---

## Known Issues / Gotchas

1. **Port 3000 is Grafana** on mini-canterbury — Tenon runs on **3001**. The env file at `/etc/tenon/env` has `PORT=3001`. Do not change this.

2. **`corepack pnpm` not bare `pnpm`** — the dev Mac's Node is v20, project requires v22. `corepack pnpm` works; `pnpm` alone gets "command not found" because corepack shims aren't in PATH.

3. **Express 5 wildcard syntax** — SPA fallback must use `'/{*path}'` not `'*'`. Express 5 (in prod) uses path-to-regexp v8 which rejects bare `*`.

4. **CSS specificity trap** — The `html:not([data-theme])` fallback in `index.css` must stay as `html:not([data-theme])`, NOT `:root`. Both `:root` and `[data-theme]` have specificity (0,1,0); if the fallback is `:root` and comes later in the compiled output, it wins over the theme blocks. This was a P0 bug that was fixed — don't regress it.

5. **`--ease-out` is `cubic-bezier(0,0,0.2,1)`** — decelerate/ease-out. The prior value `(0.2,0,0,1)` was ease-in. Both files (`index.css` and `tokens.css`) must have the same value.

6. **`tailscale funnel` on 443 is the calorie app** — Do not run `tailscale funnel --bg 3001` without `--https=8443`. Running it without specifying the port overwrites the root `/` mapping on 443 and breaks the calorie app.

7. **Migrations are copied at build time** — `tsup.config.ts` runs `mkdir -p dist/migrations && cp migrations/* dist/migrations/` on success. The old version ran `cp -r migrations dist/migrations` which created a nested `dist/migrations/migrations/` directory and broke the server at startup.

8. **`sudo` on mini-canterbury** requires a terminal for password — passwordless sudo is configured only for `systemctl`, `cp`, `journalctl`. The deploy script uses `ssh -t` for the remote step.

9. **MCP rate limit is global not per-client** — Tailscale Funnel proxies to localhost so `req.ip` is always `127.0.0.1`. The 60 req/min cap is effectively a single global window. This is documented in the server source and is acceptable for single-user use.

10. **`clientOps.applyOpsLocal` mirrors the server `applyOps`** — the viewport applies ops optimistically with a client-side twin of `packages/server/src/lib/applyOps.ts`. If you change op semantics on the server, change both or optimistic state silently drifts until the next refetch (SSE/reload). The store has a rev safety net: an `ok` response whose rev ≠ optimistic rev triggers a refetch.

11. **Undo is inverse-op based and goes through the validated pipeline** — `invertOps` builds undo ops; undo/redo POST them like any edit. A remote edit via SSE clears the undo stack (§3.3). The UI supplies explicit ids on every add so undo/redo are deterministic. `duplicate_board` is intentionally **not** invertible (server-assigned id) — the viewport never emits it (duplicate is done as `add_board` in chunk 8).

12. **Do not `dispose()` `useMemo`-created THREE objects in effect cleanups** — under React StrictMode (dev) the cleanup runs while the memo is retained, leaving the remount with dead materials. The viewport relies on WebGL context teardown (Canvas unmount) to free GPU memory instead. See comments in `Viewport.tsx` / `viewportResources.ts`.

13. **`set_model_meta` routes `name` to top-level, `notes` to `meta.notes`** — `m.name` is a top-level field; `m.meta` (`ModelMetaSchema` is `.strict()`) has no `name` key. Both `clientOps.applyOpsLocal` and `server/applyOps` are correct. The inverse in `invertOps` was already correct. No viewport UI emits this op yet; relevant when MCP model-rename lands.

14. **`syncViewportTheme` now has a module-level active scene** — `setViewportScene(scene)` registers it; `theme.ts applyTheme()` calls `syncViewportTheme()` (no arg) on every theme/density change and it recolors the registered scene. The Viewport registers on mount and clears on unmount. Wood/species colors are physical and never themed.

---

## Deploy Workflow

```bash
# From dev Mac, in repo root:
./deploy/deploy.sh

# What it does:
# 1. corepack pnpm typecheck + test (all 3 packages)
# 2. Build core → server → web
# 3. Stage: server/index.js + server/migrations/ + web/ + systemd/tenon.service
# 4. tar + scp to ~/releases/<timestamp>/
# 5. npm install --omit=dev (builds better-sqlite3 + sharp native modules)
# 6. sudo cp systemd unit, daemon-reload, enable
# 7. ln -sfn ~/releases/<timestamp> ~/current
# 8. sudo systemctl restart tenon
# 9. Verify: sudo systemctl is-active tenon || print journal
# 10. Prune: keep last 5 releases
```

**Rollback:**
```bash
ssh bhughes@mini-canterbury
ln -sfn ~/releases/<previous-timestamp> ~/current
sudo systemctl restart tenon
```

---

## Local Verification

**Running the stack locally:**

The server `dev` script (`tsx`) **fails** — CJS + `@tenon/core` ESM-only export hits `ERR_PACKAGE_PATH_NOT_EXPORTED`. Always run the built bundle:

```bash
# Terminal 1 — API server
corepack pnpm --filter @tenon/server build
DATA_DIR="$PWD/data" PORT=3000 NODE_ENV=development node packages/server/dist/index.js

# Terminal 2 — Vite dev server (proxies /api → :3000)
corepack pnpm --filter @tenon/web dev
```

Create a model (no UI create flow yet):
```bash
MID=$(curl -s -X POST http://localhost:3000/api/models \
  -H 'Content-Type: application/json' -d '{"name":"Smoke Test"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "open http://localhost:5173/designer/$MID"
```

**Headless R3F screenshots:** use `puppeteer-core` with `--use-angle=swiftshader` (software WebGL). Do **not** use `chrome --headless --screenshot --virtual-time-budget` — R3F's rAF loop never lets virtual time drain. Full recipe in chunk 7 commit / git log.

Chunk 7 was verified headless (0 JS errors, canvas + inspector + theme bridge correct). Screenshots in `docs/screenshots/chunk7/` (git-ignored).
