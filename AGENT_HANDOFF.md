# Tenon — Agent Handoff Document

**Date:** 2026-07-06 (chunk 13 COMPLETE — "errors must teach" pass on op rejections; the §15-row-13 MCP tools already shipped in chunk 11. Numbering note: §15 governs — chunk 13 is NOT the bid engine; the bid engine is §15 row 16 / Phase 4 and is the next unbuilt feature. Photo capture shipped in chunk 4, not 12.)  
**Repo:** https://github.com/bhughes1706/tenon  
**Spec:** `docs/tenon-spec-v0.4.md` (always load this — it is the ground truth)

---

## ✅ CHUNK 13 — COMPLETE (2026-07-06)

**Read `docs/chunk13-design.md`.** §15 row 13 = *`apply_model_ops`/`get_model`/
`validate_model` MCP + "errors must teach" pass*. The three tools already shipped in
chunk 11; the remaining (Fable-tagged) deliverable was the **error-quality pass** on op
rejections — the Claude edit loop only converges if the rejection text teaches recovery.

1. **`validators.ts` — every op rejection now teaches.** Unknown `op` echoes the bad value
   + lists all valid ops (derived from `OpSchema.options`, can't drift). Referential
   errors (`noBoard/noJoint/noGroup` helpers) append the ids that DO exist (`known()`,
   capped at 10) + the same-batch explicit-`board.id` gotcha. Locked / duplicate-id /
   `transform_board`-pos-or-rot messages spell out the fix. Step-3 preconditions were
   already teaching (chunk 9) — used as the model. **All prior test substrings preserved.**
2. **`modelService.ts` — rev-conflict** messages (fast pre-check + CAS race) now name the
   current rev and the refetch-reapply-retry recovery. Kept the `rev conflict` substring.
3. **Tests:** +5 `validators.test.ts` "errors must teach (§11.4)" assertions. core **191**
   (+5) / server **27** / web **89**; server dist manifold refs **0**. Messages also
   exercised end-to-end through built `dist/`.

**Chunk-numbering correction:** the "What is NOT built" table below had drifted — it listed
chunk 13 as the bid engine. **§15 governs**: 13 = the MCP/errors pass (done); the **bid
engine is §15 row 16 (Phase 4)** and is the real next unbuilt feature. Table fixed below.

---

## ✅ CHUNK 12 — COMPLETE (2026-07-06)

**Read `docs/chunk12-design.md` before touching the M&T carve.** The four §5.6 features
chunk 10 deferred are now carved; `JOINT_FEATURE_UNIMPLEMENTED` no longer fires for M&T.

1. **New cutter primitive `CutterFrustum`** (`eval/types.ts`): linear sweep between two
   axis-aligned rects — the wedged mortise's exit flare and the sloped haunch are not
   boxes. `Cutter = CutterBox | CutterFrustum` flows through `CutterSet`/`evaluate`;
   built via `Manifold.hull(8 corners).asOriginal()` (provenance keeps working); its own
   overcut rules (`solids.ts overcutFrustumToBoard`, 2 rules — see design doc §1);
   `carveKey` serializes it (memo just works). **Frustum helpers live in `types.ts`, NOT
   `solids.ts`** — `joints/util.ts` and `markers.ts` import them, and that chain must stay
   clear of WASM-adjacent modules for the server grep-invariant.
2. **M&T rewrite** (`joints/mortiseTenon.ts`): one internal `layout()` derives everything
   (bands, through/blind, haunch side + governing groove, twin thirds, pin placement);
   the carve and the exported `drawborePins()` (markers seam) share it. Haunch depth
   derives from the **governing edge groove** on a (§3.4 live derivation — entry face →
   groove edge name, best slot-band overlap; nearest-on-edge fallback so a misaligned
   groove warns `HAUNCH_GROOVE_MISMATCH` instead of pretending there's no groove). The
   haunch **socket cutter is always emitted** — coplanar with a matching groove it unions
   to a no-op. Haunch band **replaces** its side's width shoulder (`L = U/4` default).
   Twin = usable width in thirds. Wedged requires through (`WEDGE_NEEDS_THROUGH`),
   flares 1/8/side at the exit, kerfs (feature kind `'kerf'`, new) stop 1/2 from the
   shoulder. New warning codes: `HAUNCH_NO_GROOVE`, `HAUNCH_GROOVE_MISMATCH`,
   `WEDGE_NEEDS_THROUGH`, `DRAWBORE_NO_ROOM`.
3. **Drawbore = markers, not carve** (`eval/markers.ts`, exported as
   **`@tenon/core/markers`** — a NEW package subpath, deliberately not on the base entry
   (server bundle grep) nor `/eval` (WASM)). `jointMarkers(model)` → world-space ghost-pin
   cylinders; `Viewport.tsx GhostPins` renders them translucent (amber when the joint is
   selected), hidden while exploded. The module is the seam for butt fastener ghosts
   (chunk 11 leftover, still TODO).
4. **Cut list** (`cutlist/notes.ts`): haunch/wedge-kerf/drawbore-drill notes; twin doubles
   mortise/tenon notes at U/3 width. Wedge/pin **stock** is still not a cut-list line item.
5. **UI**: `JointParamsForm` unhid all nine params (haunch select + depth/len, wedged +
   kerfs, drawbore + pin dia/offset, twin). Params were already in the chunk-2 schema —
   note the schema name is `drawbore_offset` (spec table says `offset`).
6. **Tests**: property suite +21 (analytic trapezoid volumes for both haunches, wedged
   flare+kerfs, twin, socket-coplanar-with-groove, all 4 new warnings, placement); golden
   +3 (haunched square/sloped, wedged twin — the frustum carves are new kernel surface);
   `markers.test.ts` (3); notes +2. core 186 ✓ / web 89 ✓ / server 27 ✓; web vite build ✓;
   server dist manifold refs = 0 ✓.

---

## ✅ CHUNK 11 — COMPLETE (2026-07-02)

**Read `docs/chunk11-design.md` before extending any of this.** Owner-approved scope
(2026-07-02): face-click provenance picking INCLUDED; the FULL MCP model loop pulled
forward from chunk 13; live preview = a separate mini-viewport (not an in-scene ghost).

1. **Joint selection is real.** `store.selectedJointId` — mutually exclusive with board
   `selection` (either sets, the other clears). Sources: **face-pick** (plain click on a
   joint-cut face in the viewport resolves `event.faceIndex` → `userData.provenance` →
   `features[i].jointId` — `viewport/jointPick.ts pickJoint`, box-fallback safe, additive
   clicks stay board-select), the Outliner's new **Joints section**, and clickable **lint
   rows**. Right-click on a joint face → `menuTarget:'joint'` (`CommandContext` += 'joint';
   commands `joint_toggle_enabled` + `joint_delete`). Esc clears joint before boards; ⌫
   deletes the selected joint. Selected-joint faces tint amber + selection outline
   (`extractJointFaces` per board, dispose-on-replace via ref inside `useMemo`).
2. **JointInspector** (Inspector branches on selectedJointId): type label, a/b links
   (roles per §3.2: a receives, b inserts — `lib/jointTypes.ts JOINT_ROLE_HINTS`),
   enabled toggle, per-type **`JointParamsForm`** (shared with the dialog; commit-per-field
   `update_joint`, undoable), this joint's lint, delete. Only params the JointFns consume
   are shown; deferred ones (M&T haunch/wedged/drawbore/twin, housing shoulder) are hidden.
   **Known limitation: a set param can't return to "auto"** (merge patch can't delete a
   key; zod rejects null) — delete + recreate the joint.
3. **JointDialog** (`ui/JointDialog.tsx`) — opens via `J` (2 boards selected), the
   context menu, or the lint panel's **"Resolve as joint…"** button on an
   UNRESOLVED_COLLISION row (the §13 primary joint path). Type picker pre-filtered by
   live `checkJointPrecondition` (disabled types show the teaching reason; box/dovetail/
   miter listed struck-through); preselect = first passing of
   [M&T, housing, half_lap, bridle, rabbet, butt]; ⇄ swap re-runs preconditions.
   **Mini-viewport live preview**: candidate 2-board model carved through the SAME
   geometryClient worker (debounced 150 ms; `CarvedBoard.highlight` = the pending joint's
   faces, amber); shows worker joint lint + a "✓ resolves the collision" line
   (`recomputeWarnings` on the full model + pending joint). Commit parses params through
   `JOINT_PARAM_SCHEMAS[type]` first so optimistic defaults match the server (gotcha #10),
   dispatches `add_joint` with explicit `makeJointId()`, selects the new joint.
4. **Server refactor:** the §4.2 ops pipeline moved VERBATIM from `routes/models.ts` into
   **`lib/modelService.ts`** (`loadModel/createModel/listModels/applyOpsCommit/
   loadCutlistOpts/getCutlist/validateModel`); routes are thin adapters; **the MCP tools
   call the same functions** — REST and MCP cannot drift. 11 integration tests
   (`modelService.test.ts`, temp-dir sqlite) incl. rev conflict, name-column sync,
   snapshot-at-25, and joint-clears-collision.
5. **MCP model loop (§11.2/§11.4) registered** — `list_models`, `get_model`,
   `create_model`, `apply_model_ops` (ops enter as unknown[]; validateOps step 1 IS the
   parse; returns the §4.2 OpResult verbatim — ok:false is a teaching response, not an
   MCP error), `get_cutlist`, `validate_model`, `render_view`. MCP total: **15 tools**.
6. **render_view (§11.3) works end-to-end** (curl-verified: 900×675 PNG, ~4 s cold /
   ~1 s warm). `DesignerPage` + `?render=<iso|front|top|right>&hl=<ids>` →
   `ui/RenderShell.tsx` (viewport only, no chrome/SSE; flips
   `window.__tenonRenderReady` when `meshes.size === boards.length` + 2 rAFs; measure
   mode so a single highlight doesn't summon the gizmo). Server `lib/renderView.ts`:
   lazy singleton Puppeteer (swiftshader, --no-sandbox), serialized queue, screenshots
   the canvas of the server's OWN SPA. Route `GET /api/models/:id/render.png` (+10/min
   limiter, §16.6) + the MCP tool. `'right'` added to ViewPreset/VIEW_DIRS/commands.

**Chunk-11 gotchas:**
- **render_view needs the BUILT web next to the server** (`dist/web` in deploy layout).
  Locally: `packages/server/web → ../web/dist` symlink (gitignored) after
  `pnpm --filter @tenon/web build`. `vite dev` can NOT serve render mode.
- **`puppeteer` is pinned exactly (25.3.0)** per §16.5. First `npm install --omit=dev`
  on the mini PC downloads Chromium (~170 MB) + needs the usual shared libs
  (`apt` one-liner per spec §16.5) — check the first post-deploy render.
- **JointDialog carves preview candidates through the shared worker/eval-cache** —
  it evicts the cache entries for the two boards (keyed on cutters), so the next main
  re-carve recomputes just those (~ms). Don't "fix" by spawning a second worker.
- **geometryClient is now statically imported from the designer chunk** (JointDialog).
  Rollup folds THREE into the geometryClient chunk; main index bundle is UNCHANGED
  (404 KB, 0 manifold / 0 BufferGeometry — invariant re-verified).

**Counts after chunk 11:** core **157** (+1 skipped bench) · server **27** · web **89**.

---

## ✅ OFF-AXIS GEOMETRY — COMPLETE (2026-07-02)

The "v1 is 90°-only" restriction is lifted. Boards/assemblies may now sit at ANY world
rotation; the analytic stack no longer assumes world-axis alignment anywhere:

1. **Collision is exact at any angle.** `narrowphase(a, b)` (`core/geometry/collision.ts`)
   now takes Boards: axis-aligned pairs keep the cheap exact AABB-volume path; any other
   pair uses **`obbOverlap()` — exact OBB-OBB SAT** (15 axes, in `aabb.ts`). The old
   "off-axis → skip warning + console.warn" hole is gone. SAT `depth³` stands in for
   volume (ranking only; `intersects` is the load-bearing bit).
2. **Joints carve in the PAIR FRAME (board a's local frame), not world.** New primitives
   in `aabb.ts`: `matMul`, `isSignedPermutation`, `reframeBox`, `pairFrame`,
   `isMutuallyAligned`. `pairSolids(a, b)` (`eval/joints/util.ts`) builds the BoardSolids
   a JointFn consumes — a's box exact in its own frame, b's reframed into it.
   **The six JointFn recipes are byte-for-byte unchanged** — only the frame their inputs
   are expressed in changed (golden snapshots passed WITHOUT regeneration). `BoardSolid`
   gained a `frame` field; `toLocal()` reframes pair-frame cutters into each target
   board's local frame via `reframeBox`.
3. **The alignment requirement is now RELATIVE, not absolute:** a joint requires the two
   boards be square *to each other* (`Ra^T·Rb` a signed permutation), at any assembly
   orientation. A genuinely compound-angle pair is REJECTED by `checkJointPrecondition`
   with a teaching reason ("not square to each other…") — add_joint hard-fails, an
   existing joint skips the carve + warns. Never carved wrong.
4. **`JOINT_PRECONDITION_FAILED` is now persistent lint.** It moved from validateOps'
   transient step-3 soft-warn (which vanished on the next unrelated op) into
   `recomputeWarnings()`, which re-derives EVERY enabled joint's precondition on every
   model set (client optimistic + server post-commit). validateOps step 3 keeps only the
   hard add_joint gate and now always returns `warnings: []`. The store's
   `ANALYTIC_CODES` filter already dedupes the worker's copy — no UI change needed.

**Tests added:** SAT true/false-positive cases (Monte-Carlo verified fixtures) in
`collision.test.ts`; rotated-assembly M&T + half-lap carve-exactness and compound-angle
rejection in `joints.property.test.ts`; relative-alignment accept/reject in
`preconditions.test.ts`; persistent-lint cases in `collision.test.ts` + `validators.test.ts`.
Counts: core **150** (+10). Web/server suites + both bundle invariants re-verified green
(server 0 manifold refs; web main bundle 0 manifold/0 BufferGeometry, 408 KB).

**Still true:** cutters are axis-aligned prisms *in the pair frame* — compound-angle
JOINERY (out-of-square pairs) is unsupported and cleanly rejected. `solveSnap` magnetism
still uses world AABBs of neighbours, so magnetic snap targets on rotated boards are
approximate (cosmetic; Alt suspends). The gizmo's 15° `rotationSnap` and the Inspector's
15°-step Rot° inputs are now fully supported inputs, not a lint hole.

---

## ✅ REMAINING FIXES — DONE (2026-07-02)

All 6 items from the 2026-07-02 review are fixed, typechecked, and tested green
(core 157/158 + 1 skipped bench — 7 new locked-enforcement cases in
`validators.test.ts`, server 16, web 77; server bundle still 0 manifold refs; web
build still succeeds with the PWA plugin). None touched the geometry stack.

1. **Model `name` dual-source drift — fixed.** `routes/models.ts`: the `/ops` route now
   also writes the `name` column when `set_model_meta` changes `doc.name` (compares
   `model.name !== updated.name` before the CAS UPDATE); `PATCH /:id` now also rewrites
   `doc.name` (+ `doc.meta.updated_at`) when `name` is provided, so list pages and the
   designer never disagree.
2. **PWA API caching — fixed.** `vite.config.ts` workbox `urlPattern` is now
   `({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/events'` —
   matches the pathname (not the dead full-URL regex) and excludes the SSE stream.
3. **`locked` is now enforced**, not just Inspector-cosmetic. `validateOps` (`SimState`
   gained a `locked` map): `update_board`/`transform_board`/`remove_board` reject on a
   locked board, except an `update_board` patch of exactly `{locked: false}` (unlocking).
   Web: `Viewport.tsx` withholds the gizmo target for a locked selection (no drag can
   even start); `modelStore.removeSelected` drops locked ids from the batch (a single
   locked `remove_board` would otherwise fail the WHOLE batch); keyboard ⌫ goes through
   `removeSelected` so it's covered for free. `duplicateSelected` was already safe —
   copies always start `locked: false` and never mutate the locked source.
4. **SSE reliability — all 4 landed.** (a) `sse.ts` writes a `: heartbeat\n\n` comment
   every 30s per client, cleared on `close`. (b) `modelStore.connectEvents` tracks
   `hadError` across an `error` event and refetches the model on the next `open` (the
   *first* open is a no-op, only a reconnect triggers it). (c) `log_note`/`log_time` in
   `mcp/server.ts` now `emitSse('job_changed', { id: job_id, event: 'note_added' | 'time_logged' })`.
   (d) `JobDetail.tsx` now opens its own `EventSource('/api/events')` and refetches via
   `load()` on `photo_added`/`job_changed` matching its job id.
5. **deploy.sh stale comment — fixed.** PORT=3001, DATA_DIR=/home/bhughes/data, and the
   funnel line now reads `tailscale funnel --bg --https=8443 3001` (scoped off port 443,
   which is the calorie app — gotcha #6) with a note that the PWA itself stays
   tailnet-only, no funnel.
6. **Smaller fixes — all 3 landed.** `server/index.ts`: unknown `/api/*` now 404s JSON
   via an `app.use('/api', ...)` catch-all placed before the SPA fallback; `DATA_DIR`
   with no env var now defaults to `~/.tenon/data` (was resolving inside the repo at
   `packages/data/` via `__dirname` off `dist/`). `web/lib/cutlist.ts`
   `buildCutlistOpts` fallbacks now read `SETTINGS_DEFAULTS.*` instead of duplicating
   the literals `0.2`/`0.1`/`16`.

UX gaps (bigger, need owner input on placement, but all are "route exists, button
doesn't" — still open): no create-model UI anywhere (ModelsPage empty state is
misleading); no photo upload/delete in the web UI; board `qty`/`kind`/edge-grooves not
editable (cut list's sheet + qty paths unreachable); waste factors + default species
missing from Settings.

---

## ✅ CHUNK 10 — COMPLETE (2026-06-17)

Cut list, **minimal-engine scope** (owner's call): §7 rules — rough stock, board feet / ft²,
waste factor, species cost, machining notes, grouping. **Read `docs/chunk10-design.md`** before
extending it. **Deferred:** glue-up strip math + panel movement auto-sizing (spec §15). (The
`get_cutlist`/`get_model`/`apply_model_ops` MCP tools landed in chunk 11.)

**One-line architecture:** `generateCutlist(model, opts)` is **WASM-free on base `@tenon/core`**
(`src/cutlist/`), so the **same fn runs client-side in the live panel AND server-side in the REST
route** — machining notes are pure param/dim math (no Manifold, no overlap), preserving the §6
"server bundle 0 manifold refs" invariant (re-verified: 0).

**Files:** core `src/cutlist/{format,rough,notes,cutlist,index}.ts` (+ exported from `index.ts`);
server `routes/models.ts` (real `/:id/cutlist` route + `loadCutlistOpts()`, replaced the 501 stub);
web `lib/cutlist.ts` (`buildCutlistOpts`/`cutlistToCsv`/`cutlistToHtml`/`downloadCsv`/`printCutlist`)
+ `CutlistPanel` in `ui/DesignerShell.tsx` (the `≣` rail button / `toggle_cutlist` command already
opened the panel — unchanged). **Counts:** core **140** (+20), web **77** (+7), server **16**.

**Gotcha for the next agent:** `notes.ts` **duplicates** the JointFn default formulas from
`src/eval/joints/*` (it must stay WASM-free, so it can't import them). If you change a joint
default there, update the matching branch in `notes.ts`. Note values needing the real overlap
(tenon length, fastener count) are approximated — shop-accurate, not carve-exact (see design doc).

Verified: full suites green; server + web bundle invariants hold; live curl smoke test of the
route returned correct grouping/notes/cost (total $146.50 fixture) — recipe in `docs/chunk10-design.md`.

---

## ✅ CHUNK 9 — COMPLETE

Chunk 9 (geometry evaluator) shipped in the 5 stages of `docs/chunk9-design.md` §11.
**Read `docs/chunk9-design.md` in full** (incl. the Stage 4 + Stage 5 results) before extending the evaluator. Status of each stage:

| Stage | What | Status |
|---|---|---|
| 1. Spike | manifold-3d boots + carves in worker/vitest | ✅ **committed** (`12e21ee`) |
| 2. Analytic core | `geometry/{aabb,preconditions,collision}` + tests, validateOps step 3, server + store warning authority | ✅ **committed** (`236ae41`) |
| 3. Eval skeleton | solids/evaluate/mesh (base + grooves), worker RPC, store meshes, viewport swap, delete spike scaffolding | ✅ **committed** (`0f0e66b`) |
| 4. Six JointFns | housing→rabbet→half_lap→butt→bridle→mortise_tenon + golden/property tests | ✅ **committed** (`dd747e1`, peer-review `8df7290`) |
| 5. Provenance/memo/perf | per-board memo + perf measurement + headless render verification + docs | ✅ **DONE** — see `docs/chunk9-design.md` "Stage 5 results" |
| Bonus. Joint viz | exploded view + x-ray + joint-face highlight (display-only) | ✅ **DONE** — see `docs/chunk9-design.md` "Bonus Stage" |

**Bonus stage in one line:** a **display-only** joint-visualization layer — exploded view (centroid-radial, axis-snapped, `web/viewport/explode.ts`), **isolate-selected** ghosting, and joint-face highlighting (`core/eval/jointFaces.ts` + per-board `jointMeshes` in the store). Three ephemeral store fields (`exploded`/`isolate`/`highlightJoints`), a Highlight top-bar toggle + explode/isolate sliders + ⌘K commands. No geometry/model/op/server/re-carve changes; reuses the chunk-7 `--vp-joint-hi` token + `jointMat`. **Explode + highlight are solid and headless-verified** (single M&T + 3-board shared-member connectivity case). **The isolate ghost depth-sort bug is fixed (gotcha #19 below — it was a `depthWrite` default, not inherent).** Counts: core **120**, web **70**. Full write-up in `docs/chunk9-design.md` "Bonus Stage".

**Stage 5 in one line:** `evaluate(model, cache?)` gained a per-board carve memo (`createEvalCache()`, keyed on `board.dims` + cutter boxes — the complete local-carve dependency set); the worker owns one cache and **no longer transfers buffers** (structured-clone keeps the cache intact). Measured at the §8 ceiling (96 boards/192 joints): full re-eval ~28 ms (< 250 budget), one-board incremental ~3.5 ms (< 50 budget) — so dirty-board incremental stays deferred. Carved half_lap + mortise_tenon render verified headless (swiftshader), 0 JS errors.

### Verify current state
```bash
corepack pnpm --filter @tenon/core build      # build first — web/server depend on dist
corepack pnpm --filter @tenon/core typecheck && corepack pnpm --filter @tenon/core test     # 157 pass (+1 perf.bench skipped)
corepack pnpm --filter @tenon/web typecheck   && corepack pnpm --filter @tenon/web test      # 89 pass
corepack pnpm --filter @tenon/server typecheck && corepack pnpm --filter @tenon/server test  # 27 pass
corepack pnpm --filter @tenon/server build && grep -ci manifold packages/server/dist/index.js  # → 0 (§6 invariant)
corepack pnpm --filter @tenon/web build        # prod build: emits geometry.worker + manifold.wasm assets; main bundle stays ~404 KB (no THREE/WASM)
```
Counts: core **117** (Stage 4 added 24 property + 6 golden; Stage 5 added 5 memo tests + 1 gated `perf.bench`); web **65** (unchanged); server **16**. **Server bundle has 0 manifold refs**; web **main `index` bundle has 0 manifold / 0 `BufferGeometry`** (THREE is code-split into `three.core` + `geometry.worker` + the `manifold.wasm` asset) — design §6 invariant holds.

> ✅ **Carved-joint render headless-verified (Stage 5).** A `half_lap` (two crossing boards → complementary laps carved) and a `mortise_tenon` (rail tenoned into a stile → carved assembled joint, "✓ no lint") render through worker→store→`BoardMesh` with **0 JS/worker/WASM errors** (swiftshader software WebGL via `puppeteer-core`; screenshots in gitignored `docs/screenshots/chunk9/`). Verified on the memo-modified worker. Concealed M&T joinery dimensions are proven by the golden/property suites. Recipe is in `docs/chunk9-design.md` "Stage 5 results".

### Stage 2 — DONE (files in working tree)
**New (core):** `src/geometry/aabb.ts` (worldAABB, worldOBB, overlapRegion, intersectVolume, isAxisAligned, eulerXYZToMat3/applyMat3/transpose, **worldBoxToLocal**, extent/center, types Vec3/AABB/OBB) · `src/geometry/collision.ts` (recomputeWarnings, narrowphase seam, COLLISION_VOL_EPS=1e-6) · `src/geometry/preconditions.ts` (checkJointPrecondition, CONTACT_TOL=1/64, MT_MIN_ENGAGEMENT=0.5) · `src/geometry/index.ts` · `src/geometry/__tests__/{aabb,collision,preconditions}.test.ts`.
**Modified (core):** `index.ts` (+`export * from './geometry/index.js'`) · `common.ts` (+`JOINT_PRECONDITION_FAILED`, `JOINT_FEATURE_UNIMPLEMENTED` codes) · `validators.ts` (**step 3** = `checkPreconditions`: hard-fails bad `add_joint` with teaching reason, soft-warns existing joints invalidated by a move/update) · `validators.test.ts` (BOARD_B repositioned to `[20,0,0]` so fixtures overlap; +3 step-3 tests).
**Modified (server):** `routes/models.ts` — `OpResult.warnings = [...validation.warnings, ...recomputeWarnings(updated)]` (collision authority, §6).
**Modified (web):** `lib/modelStore.ts` — `recomputeWarnings` now from `@tenon/core`; **adopts `result.warnings` on the ok branch** · `viewport/Viewport.tsx` — `worldAABB` from `@tenon/core` · `viewport/bounds.ts` — rewritten to call core `worldAABB`. **Deleted:** `lib/collision.ts`, `lib/collision.test.ts` (logic now in core).

### Stage 3 — DONE (files in working tree)
The full base+groove carve pipeline runs end-to-end: worker → store → viewport. Boards render from worker-carved `<bufferGeometry>` (flat box fallback while computing / for joint-free boards). Joint cutters are the only thing left — they slot into `evaluate.ts`'s existing `cutterBoxes` array (Stage 4).

**New (core/eval):** `src/eval/solids.ts` (`baseSolid`, **`buildCutter`** = box→Manifold prism + captured `originalID` for provenance, `edgeGrooveCutters` = §3.4 grooves→local CutterBoxes, `OVERCUT=0.01`) · `src/eval/mesh.ts` (`toEvalMesh`: Manifold `getMesh()` → **de-indexed per-face flat normals** + per-triangle provenance from `runOriginalID`/`runIndex`) · `src/eval/evaluate.ts` (`evaluate(model)` → per-board `baseSolid` + grooves → one batched `subtract(union(cutters))` → `EvalMesh`; frees every WASM object in a `finally`) · `src/eval/__tests__/evaluate.test.ts` (3 tests: volume, unit normals, idempotence, groove provenance).
**Modified (core/eval):** `src/eval/index.ts` — exports `evaluate`/`baseSolid`/`buildCutter`/`edgeGrooveCutters`/`toEvalMesh`/`OVERCUT` + all `types`; **spike exports removed**.
**New (web):** `src/lib/geometryClient.ts` — `carve(model)`: lazy-spawn worker, coalesce bursts (1 in-flight + 1 queued, latest wins → superseded callers get `null`), rebuild `BufferGeometry`. **Pulls THREE — imported ONLY via `import()` from the store**, so the main bundle stays THREE/WASM-free.
**Modified (web):** `src/workers/geometry.worker.ts` — real `{reqId, model}` → `{reqId, ok, boards, warnings}` RPC, buffers in transfer list, `getManifold()` warmed on spawn · `src/lib/modelStore.ts` — `meshes: Map<id, BufferGeometry>` + `evaluateGeometry()` action (dynamic-imports geometryClient; `evalSeq` latest-wins guard; **dispose-on-replace**, dispose+clear on `load`) · `src/viewport/Viewport.tsx` — `BoardMesh` renders `carved ?? boxGeom`; `SceneContents` re-carves via `useEffect([model])`; carved edges derive from the same geom.
**Deleted:** `eval/spike.ts`, `eval/__tests__/spike.test.ts`, `web/spike.html`, `web/src/spike-main.ts`; `vite.config.ts` spike `rollupOptions.input` (kept `optimizeDeps.exclude` + `worker.format`).

### Decisions made in Stage 3 (locked — Stage 4 must follow)
1. **Normals: de-index, don't trust `calculateNormals`.** A node probe showed manifold-3d 3.5.1 `calculateNormals(3,…)` puts normals at channel **6**, not 3 (numProp went to 9) — the nonzero-`normalIdx` path is unreliable. `mesh.ts` instead uses plain `getMesh()` and **de-indexes into per-face flat normals** (every triangle gets its own 3 verts + the triangle's geometric normal). v1 boards are planar, so flat normals are physically exact, version-proof, and deterministic (idempotence holds). The old "calculateNormals UNVERIFIED" gotcha is **resolved/obsolete**.
2. **Provenance via `runOriginalID`/`runIndex` (probe-verified).** Capture `cube.originalID()` *before* `translate` (translate makes a product, `originalID()`→−1); the leaf ID survives `union` and `subtract` (probe: 2 cutters unioned → runs `[1,2,3]`). The source cube can be `delete()`d right after `translate` — the integer ID persists. `buildCutter` returns `{manifold, originalId}`; `evaluate` builds `Map<originalID → feature index>`; `toEvalMesh` walks the run table to fill the per-triangle `Uint16Array`. **Feature 0 = base; grooves/joints append.** Unknown IDs default to 0 (never crash).
3. **One batched `subtract(union(cutters))` per board** (design §2d) — confirmed to preserve per-cutter provenance, so Stage 4 joints get correct per-feature tagging from the single boolean.
4. **Eval is triggered from the viewport, not the store's set sites.** `SceneContents` `useEffect([model])` → `evaluateGeometry()`. This scopes the worker spawn to designer-mount and keeps the store free of THREE/worker static imports. Don't move the trigger into `applyAndPost` (would spawn the worker app-wide).
5. **Carved meshes are board-LOCAL** (centred at origin, same as the box). The R3F `<group>` keeps `board.transform`; the gizmo still moves the *board*. Stage-4 JointFns must emit `CutterBox` in the **target board's local frame** (use `worldBoxToLocal` from `core/geometry`).
6. **Worker warnings are `[]` for now.** `evaluate` returns `{boards, warnings}` but Stage 3 emits no joint warnings; the store **ignores** worker warnings (collision/preconditions stay analytic + server-authoritative). Stage 4 wires THIN_TENON/THIN_MORTISE_WALL/NEAR_THROUGH/JOINT_FEATURE_UNIMPLEMENTED through `evaluate`'s `warnings` and decides how the store merges them.

### Stage 4 — DONE (files in working tree)
All six first-wave JointFns implemented + the §6.1 golden/property suite. **Full details + the locked Stage-4 decisions/deviations are in `docs/chunk9-design.md` "Stage 4 results — 2026-06-15"** — read that before extending the joints.

**New (core):** `src/eval/joints/{util,butt,rabbet,housing,halfLap,bridle,mortiseTenon,index}.ts` — one `JointFn` each (pure box math, no WASM) + the `JOINT_FNS` registry · `src/eval/__tests__/{fixtures,joints.property,joints.golden}.ts` + committed golden snapshot (`__snapshots__/joints.golden.test.ts.snap`).
**Modified (core):** `evaluate.ts` — builds `BoardSolid`s (worldAABB/worldOBB), runs each enabled joint's `JointFn`, accumulates per-board `CutterBox`es, stamps `jointId`, merges warnings; precondition re-check skips+warns invalid joints; unknown joint type → `JOINT_FEATURE_UNIMPLEMENTED` · `solids.ts` — added **`overcutToBoard()`** (central overcut, see below) and `edgeGrooveCutters` is now **exact** · `eval/index.ts` exports `JOINT_FNS`.
**Modified (web):** `lib/modelStore.ts` — added **`jointWarnings`** (joint *geometry* lint from the worker; analytic codes filtered to avoid dup with the server's `warnings`), set in `evaluateGeometry` · `ui/DesignerShell.tsx` — `LintList`/`lintCount` render the union of `warnings` + `jointWarnings` · `lib/geometryClient.ts` — carved geometry now carries `provenance`+`features` on `geometry.userData` (chunk-11 contract).

**Two big Stage-4 things the next agent MUST know** (rest in the design doc):
1. **Overcut is centralised now** — `overcutToBoard()` in `solids.ts` opens only the cutter faces flush-with/beyond a board face (interior pocket walls stay exact), applied in `evaluate.ts` before `buildCutter`. **JointFns + `edgeGrooveCutters` emit EXACT boxes** — do NOT re-add per-cutter `OVERCUT` (it silently removed extra material and broke the half-lap complement; that's why it moved).
2. **Square haunch + housing `shoulder` + M&T wedged/drawbore/twin/sloped are DEFERRED** (warn `JOINT_FEATURE_UNIMPLEMENTED`, param round-trips). Square haunch was scoped *in* by the design — re-scope to chunk 11 / a follow-up (see design doc decision 2).

### Stage 4 entry points (historical — these are now implemented)
- **JointFn contract** in `eval/types.ts`: `JointFn = (a, b, params, ctx) → CutterSet { a: CutterBox[], b: CutterBox[], warnings }` — pure box math, **no WASM**. `BoardSolid` carries `aabb`+`obb`.
- **Build order** (§14, all landed): `housing → rabbet → half_lap → butt → bridle → mortise_tenon`. `CutFeatureKind` values used: `dado`/`rabbet`/`lap`/`slot`/`cheek`/`mortise`/`tenon_cheek`/`shoulder` (haunch unused — deferred).

### Locked design decisions the next agent MUST follow (consistency)
1. **Local-space carve** (design §5, gotcha #5): carve each board in its OWN local frame (box at origin, dims along x/y/z); R3F keeps `board.transform` position/rotation. Collision/preconditions use **world** AABBs from `core/geometry`. Don't mix frames.
2. **JointFn returns `CutterBox` specs, not `Manifold[]`** — deviation from design §2c, documented in `eval/types.ts`. JointFns are pure box math (no WASM); the Manifold carve is confined to `evaluate.ts`. Cutters are axis-aligned boxes in the **target board's local frame** — compute world overlap via `overlapRegion`, convert with `worldBoxToLocal`.
3. **`eulerXYZToMat3` must match three.js Euler 'XYZ'** (verified against the chunk-8 collision test) — don't change the convention; the viewport/gizmo/snapping all assume it.
4. **Base `@tenon/core` stays WASM-free.** `geometry/*` is on the base entry (server uses it). Only `@tenon/core/eval` pulls manifold-3d. Never re-export `eval` from `src/index.ts`.
5. Provenance: best-effort via Manifold `asOriginal()`→`originalID()`→`runOriginalID`. **Stored, unused until chunk 11** — don't build the pick UI.

### Gotchas found this session
- **Step-3 preconditions reject non-overlapping joints.** The chunk-1 test fixtures placed boards apart; `BOARD_B` was moved to `[20,0,0]` so housing/M&T between A and B is geometrically valid. **Any new joint test fixture must use genuinely overlapping boards** or the precondition rejects it.
- **Edge-groove convention** (no spec text was loaded for §3.4 edges — picked & **implemented in `eval/solids.ts` `edgeGrooveCutters`**): top/bottom = ±y(width) edges running along x(length); left/right = ±x(length) ends running along y(width) (right=+x, left=−x); groove `depth` cuts inward from the edge, `width` is the z(thickness) extent, `offset` shifts it along z. Mouth + run-ends overcut by `OVERCUT`=0.01" (gotcha #4); `stop_near`/`stop_far` pull the run ends in instead. **Confirm against the spec when available** — if it differs, only `edgeGrooveCutters` changes.

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
corepack pnpm --filter @tenon/core test      # 158 tests (157 pass + 1 perf.bench skipped)
corepack pnpm --filter @tenon/server test    # 27 tests
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
- `JobDetail` — tabs: Overview (status/payment dropdowns, deposit, due date, client), Photos (grid view + upload), Hardware (add/delete items), Feed (notes + time logs with category)
- `ModelsPage` — list models, link to `/designer/:modelId`
- `SettingsPage` — Appearance (theme/density SegmentedControl), Designer, Business sections
- `DesignerPage` — renders `DesignerShell` (placeholder viewport — **chunk 7 replaces this**)

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
| ~~12~~ | ~~Mortise & tenon (full §5.6 param set)~~ | **DONE** (photo capture shipped in chunk 4; see the numbering note in the CHUNK 13 section) |
| ~~13~~ | ~~`apply_model_ops`/`get_model`/`validate_model` MCP + "errors must teach" pass~~ | **DONE** |
| **16 (§15)** | **Bid engine** (materials + hardware from cut list × waste × cost + labor categories + overhead + margin), estimate-vs-actual, printable bid, `estimate_bid` MCP tool | 15/cut-list — **the real NEXT unbuilt feature (Phase 4)** |
| 16.5–19 (§15) | 3D print export (3MF), profiles/turnings, box joint + dovetail solver, settings screen full impl, wood textures, shop-mode density | various |

**Phase boundary:** Chunks 1–6 = Phase 1 ("Foundation") — the spec's survival milestone. Jobs/photos/MCP is a complete usable product. **Chunk 7 begins Phase 2 ("Assembly").**

---

## Chunk 9 Entry Conditions (What the Next Agent Needs to Know)

> ⚠️ **Partly superseded** — this section describes the pre-work state. For current status (Stage 2 done, Stage 3 partial) use the **⏩ CHUNK 9 — IN PROGRESS** section at the top. The "collision authority switch" and "manifold-3d not yet a dependency" notes below are now resolved. Kept for the spec/design background.

Chunk 9 = Manifold WASM geometry evaluator in a web worker; joint evaluation pipeline. The long pole — see spec §6 (evaluator), §6.1 (joint test invariants), §5 (joint types).

**Design mini-spec: `docs/chunk9-design.md` — read it before starting.** Decisions locked in the design session: (1) scope is **infra + first wave** (`butt`/`rabbet`/`housing`/`half_lap`/`bridle`/`mortise_tenon`; box + dovetail deferred per §5.7/§5.8); (2) **no server Manifold** — preconditions + collision are analytic core fns (exact for v1's 90° boards), Manifold runs only in the web worker for display carves; (3) viewport swaps to carved meshes (box fallback) and emits face provenance, but the pick UI stays chunk 11. Carve in **board-local** space to keep the chunk 7/8 gizmo/snapping path intact. **90° is insurance-contained, not committed:** collision/overlap go through a `narrowphase`/`overlapRegion` seam (v1 body = analytic-AABB), `BoardSolid` carries an oriented box, and non-90° boards warn rather than over-report — so OBB/CSG drops in later without a rewrite (see the doc's "Angle readiness" table).

**Where chunk 8 left the hooks:**
- **Collision authority switch.** `modelStore.ts` currently fills `store.warnings` from the **client** broadphase (`src/lib/collision.ts` `recomputeWarnings`) on every model mutation, ignoring `OpResult.warnings`. Chunk 9 makes the server's Manifold narrowphase authoritative — start using `result.warnings` (and decide whether to keep the client broadphase as an instant-feedback layer during optimistic edits). The collision logic and the `UNRESOLVED_COLLISION` shape are settled; only the source changes.
- **Per-board AABB / `worldAABB`** lives in `src/lib/collision.ts` (exact for 90° rotations). The evaluator's broadphase step (§6 step 4) can reuse it; narrowphase replaces the penetration test with a real intersection-volume check.
- **Joint provenance → click-a-face** (§6 step 5): boards are flat meshes today (`BoardMesh` in `Viewport.tsx`). The evaluator emits indexed meshes with face provenance; the viewport will swap to evaluator output and add face-pick → joint highlight (chunk 11 joint dialog consumes it).
- **Joints aren't selectable yet** — context-menu joint entries (Edit params/Disable/Delete) were deferred for that reason. Add `'joint'` to `CommandContext` (`registry.ts`) when joint meshes become pickable.

**Store is the integration point:** `src/lib/modelStore.ts` (Zustand singleton). Commands read it via `useModelStore.getState()`. New commands go in `src/lib/viewportCommands.ts`.

**Dependencies already installed:** `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`, `zustand`. (`manifold-3d` is **not** yet a dependency — chunk 9 adds it. Read gotcha about golden tests / kernel upgrades, spec §6.1 / Known Issues.)

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

17. **Warnings are recomputed on every model set** — `modelStore` calls `recomputeWarnings` everywhere `model` is assigned (load/optimistic/reconcile/reject/undo/redo/SSE). If you add a new code path that sets `model`, set `warnings` alongside or lint goes stale. (Ch.9 replaces this with server narrowphase — see Chunk 9 Entry Conditions.)

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

Create a model (no UI create flow yet):
```bash
MID=$(curl -s -X POST http://localhost:3000/api/models \
  -H 'Content-Type: application/json' -d '{"name":"Smoke Test"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "open http://localhost:5173/designer/$MID"
```

**Headless R3F screenshots:** use `puppeteer-core` with `--use-angle=swiftshader` (software WebGL). Do **not** use `chrome --headless --screenshot --virtual-time-budget` — R3F's rAF loop never lets virtual time drain. Full recipe in chunk 7 commit / git log.

Chunk 7 was verified headless (0 JS errors, canvas + inspector + theme bridge correct). Screenshots in `docs/screenshots/chunk7/` (git-ignored).
