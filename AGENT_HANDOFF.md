# Tenon — Agent Handoff Document

**Date:** 2026-07-07 (chunk 17 COMPLETE — router mode / edge profiles. §15 governs chunk
numbering, not this file's section order — see the completion log below for what
"chunk N" maps to. **Next unbuilt feature: chunk 18, bid engine** — see spec §15/§17.)  
**Repo:** https://github.com/bhughes1706/tenon  
**Spec:** `docs/tenon-spec-v0.4.md` (always load this — it is the ground truth)

> **Housekeeping note (2026-07-07):** this file had grown to 700+ lines of per-chunk lab
> notes. Pruned the completed-chunk write-ups down to what a future agent actually needs
> (current architecture contracts + a one-paragraph-per-chunk log); full blow-by-blow
> detail for any chunk still lives in `docs/chunkN-design.md` and git history — use those
> for archaeology, keep this file for "what's true now."

---

## Completion log (one paragraph per chunk — see docs/chunkN-design.md for full detail)

- **✅ Chunk 17 (2026-07-07) — router mode / edge profiles.** The first curved-cross-
  section cutter: `CutterProfile` (`eval/types.ts`) joins `CutterBox`/`CutterFrustum` — a
  2D profile polyline in ARRIS-FRAME (u,v) extruded along one of the 8 arrises. Pure curve
  math in `eval/profiles.ts` (`profileCurve`, `PROFILE_FACETS = 16`: roundover/cove 90°
  arc, ogee two r/2 arcs sharing a midpoint, chamfer/rabbet straight) per
  `docs/chunk17-design.md §2`, verbatim from the verified derivation. **Placement (the
  §3 winding gotcha) was implemented via an explicit affine `Manifold.transform(Mat4)`
  rather than Euler `rotate`:** extrude centred along local z, then map (X,Y,Z)→(uAxis,
  vAxis, sweep) with a proper-rotation matrix whose z-sign is `+1` for sweep axis 0 and
  `−1` for axis 1 (chosen so det=+1 — axis 1's natural assignment is a reflection).
  Winding is normalized by signed area before extrude so `Manifold.extrude`'s Positive
  fill keeps the polygon. `CutterProfile` carries `half: [halfU, halfV]` (board-derived,
  NOT in carveKey) so `cutterBounds` stays self-contained for the `PROFILE_JOINT_OVERLAP`
  check. Validation in `geometry/edgeProfiles.ts` (`profileExtents`, `checkEdgeProfiles`:
  depth/reach overrun, duplicate arris, panel_fit rejection) wired into `validators.ts`'s
  post-batch board-reconstruction pass. `EdgeProfileSchema` is a discriminated union on
  `profile` (stray field = hard error). Server: `migrations/002_bits.sql` (11 seeded bits,
  forward-only runner) + `routes/bits.ts` (list/get/**post/patch** — the store takes
  writes, unlike species). Web: `bitsApi.ts` (cached + `bitToEdgeProfile` mapping),
  `viewport/arrisPick.ts` (pure `pickArris`, tested), `lib/routerApply.ts` (toggle paint
  → one `update_board`), router mode in `modelStore`/`registry`/`viewportCommands` (`E`),
  `ui/RouterPanel.tsx` (bit picker + add-bit), Inspector routed-edges section, Viewport
  paint branch. **Carve verified end-to-end** (`profiles.carve.test.ts`): all 8 arrises ×
  ogee remove the exact analytic cross-section area from the correct corner only, chamfer
  matches w²/2, adjacent profiles union cleanly, overlap warning fires/silent, memo
  invalidates only the edited board. Cutlist notes are arris-independent (collapse to
  `×N`). Out of scope (§8): stopped routing, non-45° chamfer, miter blending, live preview
  dialog (the viewport carve IS the preview). **Env note:** `modelService.test.ts` can't
  run here — better-sqlite3's native binary is built for Node 22 (ABI 127) but the active
  node is v20 (ABI 115); it throws at `new Database` before any chunk-17 code. Unrelated
  to this chunk; migration SQL was validated with the `sqlite3` CLI instead.
- **✅ Chunk 16 (2026-07-07) — box joint + dovetail spacing solver + carve.** Pure
  spacing solvers (`eval/joints/spacing.ts` `boxSpacing`/`dovetailSpacing`), two new
  JointFns (`boxJoint.ts`, `dovetail.ts`), and corner-frame preconditions
  (`geometry/preconditions.ts`) per `docs/chunk16-design.md` §1–5. Box joint is
  `CutterBox`-only; every dovetail cut is a `CutterFrustum` (chunk 12's trapezoid
  primitive) — no new cutter shape needed. **Bug found + fixed during the property-test
  pass:** `solids.ts overcutFrustumToBoard` pushed a flush frustum station outward
  without adjusting that station's cross-section, which re-spreads the taper's linear
  interpolation over the longer span instead of extruding a flat cap — corrupting the
  cross-section exactly at the true board face and silently over-removing material on
  every tapered cutter (caught by the dovetail §6.1 complement test; the sloped-haunch
  M&T frustum had the same latent bug, just under the old tolerance). Fixed by
  extrapolating each moved station along the *original* taper line instead of holding
  its rect fixed. Also broadened `dovetailSpacing`'s degenerate check — it only caught
  a collapsing tail base (`tBase ≤ 0`); a steep slope over a shallow (N=1) layout can
  collapse a pin/half-pin tip first while the tail stays positive.
- **✅ Chunk 15 (2026-07-07) — glue-up strip math + panel auto-sizing.** Printable/CSV
  export (`web/src/lib/cutlist.ts` `cutlistToHtml`/`cutlistToCsv`/`printCutlist`) already
  shipped in chunk 10 — this chunk was the two pieces chunk 10 explicitly deferred.
  **Design call (no data-model link exists from a panel to the frame around it):** a new
  `Board.panel_fit: { groove_depth } | null` (board.ts) means "this panel's own
  `dims.l`/`dims.w` are the OPENING size, not the milled blank size" — a convention on the
  panel board itself, not a geometric search. `cutlist/panel.ts` `fitPanel()` derives the
  actual blank: opening + 2×groove_depth, minus a movement gap
  (`crossGrainDim × species.shrink_tan_pct% × 0.6`, §3.4) applied **only to the axis
  perpendicular to `grain`** — movement along the grain is negligible, that axis just gets
  the groove-depth extension. Unknown species/no `shrink_tan_pct` → movement gap is 0, not
  an error. `cutlist.ts` applies `fitPanel()` before rough allowances, then `glue_up`
  strip expansion on top (§3.1: qty × `glue_up.strips`, width `fittedW/strips` + a 1/8"
  per-strip glue-line allowance ahead of the usual +1/4" width allowance); a `panel` over
  `DEFAULT_MAX_STRIP_WIDTH` (5.5", exported from board.ts, shared with `GlueUpSchema`'s own
  default) with no `glue_up` set gets `WIDE_PANEL_NO_GLUEUP` instead. Both the fit math and
  the strip math emit their derivation as a cut-list note (not just a bare warning) —
  that's the literal §3.4 instruction ("the movement lint becomes sizing math rather than
  just a warning"). `CutlistSpecies` gained an optional `shrink_tan_pct`, threaded through
  from the species table on both the server (`modelService.loadCutlistOpts`) and the web
  client (`speciesApi.ts` → `buildCutlistOpts`). **Scoped out:** `PANEL_MOVEMENT` /
  `MOVEMENT_MISMATCH` (defined in `common.ts` since chunk 2) are still unused — §3.4 says
  the sizing math *supersedes* PANEL_MOVEMENT for a fitted panel, and MOVEMENT_MISMATCH
  needs multi-species-per-panel (face-glued lamination) modeling that doesn't exist yet.
- **✅ Chunk 14 (2026-07-07) — model thumbnails.** §15 row 14's second half (`render_view`
  itself shipped early, in chunk 11). `lib/thumbnail.ts`: `scheduleThumbnail(modelId)`
  debounces 1.5s per model, then renders an iso PNG via the existing `renderModelView`
  Puppeteer pipeline and writes it to `models.thumbnail` as a `data:` URL (schema §9 — no
  separate file, unlike photo thumbnails). Triggered from `modelService.applyOpsCommit`
  after a successful commit with `applied.length > 0 && boards.length > 0`, so both REST
  and MCP get it for free. Guarded on `process.env.VITEST` (Vitest sets this itself) so
  `modelService.test.ts`'s hundreds of `applyOpsCommit` calls never spawn real Chromium.
  `ui/kit.tsx ModelThumb` renders it (with a glyph placeholder pre-render) in both
  `ModelsPage` and `JobDetail`'s Models section; both pages now also subscribe to the
  `model_changed` SSE event so a thumbnail appears live without a reload.
- **✅ Chunk 13 (2026-07-06) — "errors must teach" pass.** §15 row 13's MCP tools
  (`apply_model_ops`/`get_model`/`validate_model`) already shipped in chunk 11; this
  chunk was the error-quality pass on op rejections (`validators.ts`, rev-conflict
  messages in `modelService.ts`) so the Claude edit loop self-corrects without a human.
- **✅ Chunk 12 (2026-07-06) — mortise & tenon full carve.** Added `CutterFrustum`
  (`eval/types.ts`, a linear sweep between two rects — the wedged mortise's flare and the
  sloped haunch aren't boxes) alongside `CutterBox`; both flow through `CutterSet`/
  `evaluate`. Drawbore is rendered as **markers, not a carve** (`eval/markers.ts`, its own
  `@tenon/core/markers` subpath — kept off both the base entry and `/eval` deliberately).
  This is the direct architectural precedent for chunk 16's box/dovetail carve.
- **✅ Chunk 11 (2026-07-02) — joint dialog, MCP model loop, `render_view`.** Moved the
  §4.2 ops pipeline into `lib/modelService.ts` so REST routes and MCP tools are both thin
  adapters over the same functions (cannot drift). Added the joint dialog + face-pick
  selection + `render_view` (Puppeteer screenshots of the server's own built SPA — needs
  `dist/web` next to the server, `vite dev` can't serve render mode).
- **✅ Off-axis geometry (2026-07-02) — any-angle boards.** Boards may sit at any world
  rotation. Collision uses exact OBB-OBB SAT off-axis; joints carve in the **pair frame**
  (board a's local frame, board b reframed into it via `pairSolids`/`reframeBox`) rather
  than world space, and a joint's alignment requirement is **relative** (the two boards
  must be square *to each other*, not to world axes) — a non-square pair is rejected with
  a teaching reason, never carved wrong.
- **✅ Chunk 10 (2026-06-17) — cut list engine.** `generateCutlist(model, opts)` is
  WASM-free on base `@tenon/core` (`src/cutlist/`), so the identical function runs
  client-side in the live panel and server-side in the REST route. `cutlist/notes.ts`
  duplicates joint default formulas from `eval/joints/*` (it can't import them and stay
  WASM-free) — if you change a joint default, update the matching branch there too.
- **✅ Chunk 9 (2026-06-xx) — geometry evaluator + joint pipeline.** The architectural
  heart of the app; see "Architecture contracts" below for what's still load-bearing.

---

## Architecture contracts that still govern new work

These are the rules a chunk-16+ agent needs before touching the evaluator, joints, or
the model pipeline. Everything here is still true today; see `docs/chunk9-design.md` /
`chunk12-design.md` for how it was derived.

- **`JointFn` contract** (`eval/types.ts`): pure box math, no WASM. Takes two `BoardSolid`s
  + params, returns a `CutterSet` (`{a: Cutter[], b: Cutter[], warnings}`) where
  `Cutter = CutterBox | CutterFrustum`. The Manifold carve itself is confined to
  `evaluate.ts` — never do WASM work inside a `JointFn`.
- **Carve in the pair frame, board-local.** Each board carves in its own local frame
  (box at origin); R3F applies `board.transform` for position/rotation. A joint's two
  boards carve in board a's frame via `pairSolids`, reframed to each target with
  `reframeBox`/`worldBoxToLocal`. Off-axis alignment is checked *relative* to the other
  board, not to world axes.
- **Overcut is centralized** in `solids.ts` (`overcutToBoard`/`overcutFrustumToBoard`) —
  it opens only the cutter faces flush with or beyond a board face. **`JointFn`s and
  `edgeGrooveCutters` must emit EXACT boxes/frustums** — do not re-add per-cutter overcut,
  it silently removes extra material (this broke the half-lap complement once already).
- **Provenance + memo:** Manifold `asOriginal()` → `originalID()` → `runOriginalID` tags
  every triangle back to a feature index (base=0, grooves/joints append) — this is what
  face-pick and the joint highlight consume. `createEvalCache()`/`carveKey` memoize
  per-board carves keyed on dims + cutter set; the joint dialog's live preview evicts just
  the two boards it's previewing so the main re-carve stays cheap.
- **`@tenon/core` base entry stays WASM-free** — `geometry/*` (collision, preconditions)
  is on it because the server imports it directly with no Manifold. Only `@tenon/core/eval`
  pulls `manifold-3d`; `@tenon/core/markers` (drawbore ghost pins) is a third subpath, also
  WASM-free. Never re-export `eval` or `markers` from the base `index.ts`. Verify after any
  server build: `grep -ci manifold packages/server/dist/index.js` → must be `0`.
- **REST and MCP share one pipeline.** `lib/modelService.ts` (`applyOpsCommit`,
  `createModel`, `getCutlist`, etc.) is called by both `routes/models.ts` and
  `mcp/server.ts` model tools — never duplicate model-mutation logic in a route handler.
- **`render_view` + thumbnails** (`lib/renderView.ts` + `lib/thumbnail.ts`): a lazy
  singleton Puppeteer browser, serialized render queue, screenshots the server's own
  built SPA in a stripped-down render mode. Needs `dist/web` next to the server —
  `vite dev` cannot serve it. Thumbnails debounce 1.5s per model and are skipped entirely
  under `VITEST` — don't remove that guard, it's what keeps `modelService.test.ts` from
  launching real Chromium.
- **Warnings are recomputed on every model set**, not incrementally — `JOINT_PRECONDITION_
  FAILED` and `UNRESOLVED_COLLISION` are persistent lint derived fresh by
  `recomputeWarnings()` on load/optimistic-apply/reconcile/undo/redo/SSE, both client and
  server. If you add a new code path that sets `model`, recompute warnings alongside it.
- **`eulerXYZToMat3` must match three.js `Euler('XYZ')`** — the viewport/gizmo/snapping/
  pair-frame carve all assume this convention; don't change it without updating all four.
- **Edge-groove edge convention** (`eval/solids.ts edgeGrooveCutters`, §3.4 — not spelled
  out in the spec, picked here): top/bottom = ±y(width) edges running along x(length);
  left/right = ±x(length) ends running along y(width), right=+x/left=−x; `depth` cuts
  inward from the edge, `width` is the z(thickness) extent, `offset` shifts along z.
  `notes.ts` (cut list) duplicates this convention — keep both in sync.

---

## Known open UX gaps (still true as of 2026-07-07, verified against current code)

- No photo upload/delete in the web UI — `JobDetail`'s Photos tab is display-only; the
  `/capture` route is still a stub. Upload currently only works via MCP.
- Board `qty`/`kind`/edge-grooves are not editable from the Inspector (cut list's sheet +
  qty paths are unreachable from the UI).
- Waste factors + default species are not in `SettingsPage` (species/waste_factor_* only
  reachable via direct API/DB edits).

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
corepack pnpm --filter @tenon/core test      # 236 tests (+1 perf.bench skipped) as of chunk 16
corepack pnpm --filter @tenon/server test    # 32 tests as of chunk 14 (needs Node 22 — see gotcha #2)
corepack pnpm --filter @tenon/web test       # 89 tests (jsdom)
./deploy/deploy.sh                           # full build + deploy to mini-canterbury
```

---

## What Is Built (Chunks 1–8 complete)

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
- Tools registered (15 total): jobs/photos — `list_jobs`, `get_job`, `create_job`, `update_job`, `log_note`, `log_time`, `get_photos`, `upload_photo`; model loop (chunk 11, §11.2/§11.4) — `list_models`, `get_model`, `create_model`, `apply_model_ops`, `get_cutlist`, `validate_model`, `render_view`. Model tools are thin adapters over `lib/modelService.ts` — the same §4.2 pipeline the REST routes use.
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
- `JobDetail` — tabs: Overview (status/payment dropdowns, deposit, due date, client, model
  list w/ thumbnails), Photos (grid view, display-only — no upload/delete from web yet),
  Hardware (add/delete items), Feed (notes + time logs with category)
- `ModelsPage` — list models w/ thumbnails, "New model" creates + navigates to the designer
- `SettingsPage` — Appearance (theme/density SegmentedControl), Designer, Business sections
- `DesignerPage` — renders `DesignerShell` (real R3F viewport since chunk 7)

**`syncViewportTheme`** (`src/lib/syncViewportTheme.ts`):
- Reads `--vp-*` CSS tokens via `getComputedStyle`, applies to `ViewportScene` interface
- Scene is `undefined` until chunk 7 wires the R3F scene — function is a no-op until then

**PWA:** VitePWA, `autoUpdate`, service worker precaches all assets, `NetworkFirst` for `/api/*` with 10s timeout

**Tests:** 77 tests — `theme.test.ts` (19), `useSettings.test.ts` (8), plus chunk 7: `fraction.test.ts` (12), `clientOps.test.ts` (10 — applyOpsLocal + invertOps round-trips), `speciesColors.test.ts` (3); chunk 8: `snapping.test.ts` (9), `collision.test.ts` (8), `registry.test.ts` (4 — `forContext` coverage added in peer review); chunk 9 bonus: `explode.test.ts` (5); chunk 10: `cutlist.test.ts` (7 — buildCutlistOpts, cutlistToCsv, cutlistToHtml)

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

### `@tenon/web` — Chunk 8 (snapping · collision · outliner tree · context menu)

Design mini-spec: `docs/chunk8-design.md` (decisions + tunables; read it before extending chunk 8).

**Snapping** (`src/viewport/snapping.ts` — pure, 9 tests): `solveSnap()` does **per-axis** face/edge/end magnetism against nearby boards' world AABBs. Because v1 rotations are 90° multiples, AABBs are *exact*, so faces/edges/ends all fall out of one plane-snap solver. Wired into the gizmo's `onObjectChange` in `Viewport.tsx`: drag-start caches all AABBs, each frame pulls the dragged board toward the nearest face/edge/end within an ~8px (screen-space → world) threshold, else grid. **Alt suspends** magnetism. Magnetic guides render as dashed `--vp-snap` lines. `TransformControls translationSnap` is now **null** — the handler owns both grid and magnetic snap so they don't fight; `commitTransform` no longer re-grid-snaps (it would undo magnetic snaps).

**Collision broadphase** (`src/lib/collision.ts` — pure, 8 tests): `recomputeWarnings(model)` does pairwise AABB penetration → `UNRESOLVED_COLLISION` per pair not governed by an enabled joint. Uses a **positive-overlap epsilon (0.005")** so flush contact (butt joints, a shelf on a side) does NOT flag — only real penetration does (the §2.4 joint-completeness signal). The store recomputes warnings on **every** model mutation (load/op/undo/redo/SSE) so lint is live during optimistic edits. **Authority note:** chunk 9 moves collision to the server Manifold narrowphase via `OpResult.warnings`; the store currently ignores `result.warnings` and uses the client broadphase — switch that in ch.9.

**Outliner tree** (`DesignerShell.tsx` `Outliner`/`BoardRow`): collapsible group nodes + ungrouped boards; group row click selects members; per-group ungroup button; a "Group N boards" button appears when ≥2 selected. **No drag-and-drop** (deferred). Groups are **selection/organization only** — the gizmo stays single-board.

**Context menu** (`src/ui/ViewportContextMenu.tsx`, Radix): registry-driven via a new `Command.contexts?: CommandContext[]` (`'board'|'multi'|'empty'`) tag + `registry.forContext(target, ctx)`. Tag is **additive** — the ⌘K palette ignores it. Right-button pointerdown sets `store.menuTarget` (board/multi via `Viewport` mesh handler, empty via `onPointerMissed`) before the native contextmenu opens the menu. Entries: board/multi → Duplicate (⌘D) · Group (⌘G) · Delete; empty → Add Board + a View submenu. Highlight styling is `.ctx-item[data-highlighted]` in `index.css` (inline styles can't target Radix's data attr).

**New store actions** (`modelStore.ts`): `duplicateSelected` (emits `add_board` with explicit ids + `[2,0,2]` offset — **not** the non-invertible `duplicate_board`; copy always starts `locked: false`), `groupSelected` (emits `group` with an explicit `grp_` id so it's undoable), `ungroup`, `setMenuTarget`. ⌘D/⌘G handled in `DesignerShell` keydown. `menuTarget` is cleared via `ContextMenu.Root onOpenChange` when the menu closes.

**`liveMembers` helper** (`src/lib/groups.ts`): filters `group.members` to ids still present in `model.boards`. Use this everywhere group membership is consumed — currently the `Outliner` in `DesignerShell.tsx`. Do NOT prune on `remove_board` (would break undo).

---

## Open Decision — Right-button pan (resolve before or during chunk 9)

Chunk 8 disabled right-button pan in OrbitControls to free right-click for the context menu. This is fine for a mouse (middle-button pans), but may strand trackpad users.

**Decision needed:** what input device is at the shop PC?

- **(a) Mouse with middle button** — leave as-is. Middle-button pan works; no code change needed.
- **(b) Trackpad / no middle button** — implement a drag-distance guard: suppress `contextmenu` if `pointerDelta > 3px`, emit it only on a clean right-click. Right-drag restores pan.
- **(c) Trackpad, prefer scroll-to-pan** — enable `screenSpacePanning` in `OrbitControls`; two-finger scroll pans. Right-click still opens context menu. No right-drag pan.

This does not block chunk 9. It can be applied as a one-commit patch at any point.

---

## What Is NOT Built Yet (Remaining Chunks)

| Chunk | What | Depends on |
|---|---|---|
| ~~7~~ | ~~Viewport: R3F scene, orbit, board render, transform gizmo, Select/Add/Measure modes~~ | **DONE** |
| ~~8~~ | ~~Snapping (face/edge/end magnetism), collision broadphase, outliner tree, context menu~~ | **DONE** |
| ~~9~~ | ~~Manifold WASM geometry evaluator in web worker; joint evaluation pipeline; housing/rabbet/half-lap/bridle/butt/M&T (box/dovetail deferred)~~ | **DONE** |
| ~~10~~ | ~~Cut list (board → rough stock → waste factors), species cost, materials summary~~ | **DONE** (minimal-engine scope; glue-up/movement + `get_cutlist` MCP deferred) |
| ~~11~~ | ~~Joint dialog + lint resolve flow; face-pick; MCP model loop; `render_view`~~ | **DONE** |
| ~~12~~ | ~~Mortise & tenon (full §5.6 param set)~~ | **DONE** (photo capture shipped in chunk 4, not 12) |
| ~~13~~ | ~~`apply_model_ops`/`get_model`/`validate_model` MCP + "errors must teach" pass~~ | **DONE** |
| ~~14~~ | ~~`render_view` (Puppeteer) + thumbnails~~ | **DONE** |
| ~~16~~ | ~~Box joint + dovetail spacing solver + carve~~ | **DONE** |
| **17 (§15)** | **Router mode: bit store + edge profiles (§3.5) + `CutterProfile` swept cutter + cutlist notes + viewport arris picking** — `docs/chunk17-design.md` (derivation verified 2026-07-07, ready to implement) | 9, 2 — **the real NEXT unbuilt feature** |
| 18 (§15) | Bid engine (materials + hardware from cut list × waste × cost + labor categories + overhead + margin), estimate-vs-actual, printable bid, `estimate_bid` MCP tool | 15/cut-list |
| 18.5–20 (§15) | 3D print export (3MF), profiles/turnings, settings screen full impl, wood textures, shop-mode density | various |

**Phase boundary:** Chunks 1–6 = Phase 1 ("Foundation") — the spec's survival milestone. Jobs/photos/MCP is a complete usable product. **Chunk 7 begins Phase 2 ("Assembly").**

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

11. **Undo is inverse-op based and goes through the validated pipeline** — `invertOps` builds undo ops; undo/redo POST them like any edit. A remote edit via SSE clears the undo stack (§3.3). The UI supplies explicit ids on every add so undo/redo are deterministic. `duplicate_board` is intentionally **not** invertible (server-assigned id) — the viewport never emits it (duplicate is done as `add_board` in chunk 8). Likewise `groupSelected` supplies an explicit `grp_` id so `group` is invertible (`invertOps` returns `[]` for an id-less `group`).

12. **Do not `dispose()` `useMemo`-created THREE objects in effect cleanups** — under React StrictMode (dev) the cleanup runs while the memo is retained, leaving the remount with dead materials. The viewport relies on WebGL context teardown (Canvas unmount) to free GPU memory instead. See comments in `Viewport.tsx` / `viewportResources.ts`.

13. **`set_model_meta` routes `name` to top-level, `notes` to `meta.notes`** — `m.name` is a top-level field; `m.meta` (`ModelMetaSchema` is `.strict()`) has no `name` key. Both `clientOps.applyOpsLocal` and `server/applyOps` are correct. The inverse in `invertOps` was already correct. No viewport UI emits this op yet; relevant when MCP model-rename lands.

14. **`syncViewportTheme` now has a module-level active scene** — `setViewportScene(scene)` registers it; `theme.ts applyTheme()` calls `syncViewportTheme()` (no arg) on every theme/density change and it recolors the registered scene. The Viewport registers on mount and clears on unmount. Wood/species colors are physical and never themed.

15. **OrbitControls right-button is remapped (chunk 8)** — right-click is reserved for the context menu (§19.3), so `Viewport.tsx` sets `OrbitControls mouseButtons` to LEFT=rotate, MIDDLE=pan, RIGHT=disabled (wheel still zooms). OrbitControls `preventDefault`s the native contextmenu but doesn't `stopPropagation`, so the event still bubbles to the Radix `ContextMenu.Trigger` wrapping the canvas. If you re-enable right-drag pan, the context menu will pop after every right-drag — don't. (See also Open Decision above.)

16. **The gizmo owns grid + magnetic snap, not `TransformControls`** — `translationSnap` is `null`; all snapping happens in `onObjectChange` via `snapping.ts` `solveSnap`, and `commitTransform` only rounds float noise. If you re-add `translationSnap` or re-grid-snap in `commitTransform`, magnetic snaps get clobbered. Snap tunables (8px threshold, `[0.01,2]"` clamp, Alt-to-suspend, `[2,0,2]` duplicate offset) are in `Viewport.tsx` / `modelStore.ts` — snapping is meant to be iterated; see `docs/chunk8-design.md`.

17. **Warnings are recomputed on every model set** — `modelStore` calls `recomputeWarnings` everywhere `model` is assigned (load/optimistic/reconcile/reject/undo/redo/SSE). If you add a new code path that sets `model`, set `warnings` alongside or lint goes stale. (Server-side narrowphase is authoritative since chunk 9 — see "Architecture contracts" above.)

18. **Group members are soft references — filter at consumption, not on delete** — `remove_board` intentionally does NOT prune `group.members` because doing so would make remove non-invertible. Use `liveMembers(model, group)` (`src/lib/groups.ts`) everywhere member ids are consumed (outliner, cutlist, evaluator).

19. **✅ FIXED (2026-06-17) — Isolate (chunk 9 bonus stage) ghost depth-sort.** The "isolate selected" view (fade non-selected boards; `store.isolate`, applied per-board in `Viewport.tsx` `BoardMesh`) used to render the **tenon at the wrong height where a ghosted board interpenetrated the solid selected board at a joint** — **bottom half clipped, top flush with the mortise**, ghost outline bleeding through the solid. **The "inherent forward-renderer limitation" diagnosis was wrong.** Real cause: the ghost material was `transparent` but kept `depthWrite` at its default `true`, so it z-fought (a) its own faces — Three.js sorts transparent *objects* back-to-front but never sorts triangles *within* a mesh, so buffer order decides which survive — and (b) the coincident solid board at equal depth. **Fix: `depthWrite={!ghosted}` on the `BoardMesh` material** — the ghost stops writing depth while `depthTest` stays on, so the solid still occludes it correctly. The "holes in the solid" worry that kept depthWrite on was unfounded (the solid writes its depth in the opaque pass before any ghost pixel draws). Geometry was always correct (full-opacity renders pristine), and the once-considered alternatives (global uniform opacity, dropping the tool, order-independent transparency) were unnecessary. **Explode + highlight** are independent and unaffected. See `docs/chunk9-design.md` "Bonus Stage → FIXED".

---

## Context Management — Headroom Compress

The `headroom` MCP tool is configured to help:

**When to use:** During tasks with massive Bash/Build output that threatens context limits. Typical triggers:
- Large `pnpm build` or full test suite runs (hundreds of lines of output)
- Recursive file searches or dumps (`find`, `grep -r`, `git log`)
- Multi-step commands that produce verbose intermediate output

**How to use:**
1. When you see output approaching or exceeding ~3000 lines (or consuming >30% of available tokens), pause.
2. Use the `headroom` MCP compress tool (e.g., `mcp__headroom__headroom_compress`) to summarize/deduplicate the output.
3. Pass the compressed output back into context for analysis/next steps.

**Example:** If a full test run dumps 5000 lines, don't paste all of it — ask headroom to extract the summary (test counts, error lines, final status).

This keeps the conversation window efficient without losing signal on failures or critical details.

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

Create a model — either click "New model" on `/models`, or from the CLI (useful for
scripting/MCP-style testing without the UI):
```bash
MID=$(curl -s -X POST http://localhost:3000/api/models \
  -H 'Content-Type: application/json' -d '{"name":"Smoke Test"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "open http://localhost:5173/designer/$MID"
```

**Headless R3F screenshots:** use `puppeteer-core` with `--use-angle=swiftshader` (software WebGL). Do **not** use `chrome --headless --screenshot --virtual-time-budget` — R3F's rAF loop never lets virtual time drain. Full recipe in chunk 7 commit / git log.

Chunk 7 was verified headless (0 JS errors, canvas + inspector + theme bridge correct). Screenshots in `docs/screenshots/chunk7/` (git-ignored).
