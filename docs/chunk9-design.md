# Chunk 9 — Design Mini-Spec

**Date:** 2026-06-14 · **Model:** Opus 4.8 (design) → execute lower-tier · **Depends on:** chunk 7 (viewport), chunk 8 (collision broadphase, store)
**Spec refs:** §2.4 (overlap=engagement), §4.2 (validation pipeline steps 3–4), §5 (joint library), §6 (evaluator), §6.1 (test invariants), §11.3 (render_view), §13 (workers/store), §16.5 (manifold-3d kernel pinning)

Chunk 9 = **the geometry evaluator** — the long pole (§14 phase 3, ~10× the rest, incremental). Turn the joint param schemas that already exist in [joint.ts](../packages/core/src/joint.ts) into real geometry: pure `JointFn`s in core, a Manifold WASM carve pipeline in a web worker, the viewport swap from flat boxes to carved meshes, and the §6.1 golden/property test suite that guards kernel drift.

---

## Decisions locked in design session

| Decision | Choice |
|---|---|
| **Joint scope** | **Infra + first wave:** `butt`, `rabbet`, `housing`, `half_lap`, `bridle`, `mortise_tenon`. Box + dovetail deferred (§5.7 "after the above ship", §5.8 "last"). |
| **Geometry authority** | **Analytic core, no server Manifold.** Joint preconditions (§4.2 step 3) and collision (§6 step 4) are pure analytic core functions — *exact* for v1's 90°-multiple rotations — run on **client and server**. Manifold WASM runs **only in the web worker**, for the joint carve (display meshes). |
| **Viewport swap** | **Swap to carved meshes + emit face provenance now.** Viewport renders worker-carved `BufferGeometry` (falls back to box for un-evaluated boards). Meshes carry per-face provenance (cut → joint). The face-**pick/highlight UI** stays chunk 11. |
| **M&T depth** | Core M&T this chunk: mortise pocket, shoulder/cheek tenon, through/blind, `width_shoulders`, `snap_to_tool`, **square** haunch. `wedged` / `drawbore` / `twin` / `sloped` haunch: **schema-accepted, geometry deferred** (emit `JOINT_FEATURE_UNIMPLEMENTED` warning if set). |
| **Angle readiness** | **Insurance only.** 90° is a *contained, swappable* assumption, not a foundation. Collision + overlap go through a `narrowphase`/`overlapRegion` seam (v1 body = analytic-AABB); `BoardSolid` carries an oriented box so an OBB/CSG narrowphase drops in later; non-90° boards warn rather than silently over-report. No OBB math built this chunk. See "Angle readiness" below. |

### Why Manifold runs only in the worker (and what couples to 90°)
Manifold's one job is the **carve** — subtracting cutter prisms from a board solid → a watertight mesh with joinery cut in. That is angle-agnostic (Manifold doesn't care about orientation) and unavoidable, so it lives in the worker. Three contexts *could* run geometry; only the worker needs Manifold:
- **Worker** — produces the display meshes. Needs Manifold.
- **render_view (§11.3)** — loads the PWA's R3F scene in headless Chrome → runs the same worker → gets Manifold for free. No second kernel. *(The §11.3 `three`+`headless-gl` Node fallback is the one path that would re-introduce Node-Manifold — note it if that fallback is ever taken.)*
- **Server op-validation (§4.2 steps 3–4)** — needs *warnings*, not meshes (the PWA renders from its own worker). Warnings = collision + preconditions, which are **analytic**, so the Node bundle stays WASM-free (avoids manifold-3d in the tsup CJS bundle, per-request WASM init, and a second §16.5 golden-pin site).

**What 90° actually buys:** only that the *analytic narrowphase is exact*. For a 90°-rotated box the world AABB equals the box, so AABB-overlap volume = true intersection volume. The carve, the worker, and the whole mesh/provenance pipeline are already angle-free — the 90° assumption lives in three contained spots (narrowphase collision, overlap/precondition geometry, and per-joint cutter construction), the first two of which this chunk puts behind a seam. See **§Angle readiness**.

### Explicitly out of scope (deferred)
`box_joint`, `dovetail`, `miter` geometry; M&T `wedged`/`drawbore`/`twin`/sloped-haunch carves; panel auto-sizing + movement lint (§3.4/§8 — needs species movement coefficients, a later chunk); cut-list generation (chunk 10); joint dialog + face-pick/lint-resolve UI + `render_view` MCP tool (chunk 11); true dirty-board incremental re-eval (ship full re-eval + per-board memo; see Performance).

---

## Architecture — two layers

```
@tenon/core (base, NO Manifold — isomorphic, server + client)
  geometry/aabb.ts        worldAABB, intersectVolume, overlapRegion  (pure, exact for 90°)
  geometry/preconditions.ts  per-joint "requires" predicate (§4.2 step 3)
  geometry/collision.ts   analytic UNRESOLVED_COLLISION pass (§6 step 4)   ← authority

@tenon/core/eval (subpath export, PULLS manifold-3d — worker only)
  manifold.ts             lazy async WASM init: getManifold()
  solids.ts               board base solid + cutter-prism builders
  joints/{butt,rabbet,housing,halfLap,bridle,mortiseTenon}.ts   JointFn each (§5)
  evaluate.ts             §6 pipeline: solids → cutters → batched subtract → mesh+provenance
  mesh.ts                 Manifold mesh → transferable Float32/Uint buffers + CutFeature table

packages/web
  workers/geometry.worker.ts   imports @tenon/core/eval; RPC; posts transferable meshes
  lib/geometryClient.ts        promise-wrapped worker RPC (one in-flight eval, latest wins)
  lib/modelStore.ts            meshes map + warning-authority switch (see §4)
  viewport/BoardMesh           render carved BufferGeometry, fall back to box
```

**Why the subpath split:** base `@tenon/core` stays geometry/WASM-free, so the jobs/photos PWA and the server's op-validation never pull ~1–2 MB of Manifold WASM. Only `@tenon/core/eval` (worker + tests) pulls `manifold-3d`. Add an `exports` map entry `"./eval"` to `packages/core/package.json`; the analytic `geometry/*` modules stay on the base entry so the server imports them with no WASM.

---

## Angle readiness — the 90° upgrade path (insurance, not built)

90° (§12) is treated as a **swappable implementation detail**, not a foundation. The assumption lives in exactly three spots, and the expensive infrastructure is in none of them:

| Layer | 90° dependence | Chunk 9 stance | To relax later |
|---|---|---|---|
| Carve pipeline (worker, Manifold init, mesh/provenance, batched subtract, tests) | **None** — Manifold subtracts at any orientation | Already angle-agnostic | No change |
| Narrowphase collision | AABB-overlap exact only at 90° | Behind `narrowphase(a,b)` seam; non-90° boards warn (§1d) | Swap body → OBB-SAT (no WASM) or Manifold `a.intersect(b).volume()` |
| Overlap / preconditions | AABB-intersection | Behind `overlapRegion(a,b)`; `BoardSolid.obb` carried | Swap body → OBB clip (no WASM) |
| **Per-joint cutter construction** | Cutters are axis-aligned prisms in the receiving board's local frame | **Stays 90°-only** (the §12 compound-angle-joinery non-goal) | Per-joint, incremental — generalize each cutter to the mate's frame |

**Bottom line:** none of the chunk 9 investment is wasted if 90° is relaxed later. Worst case you trade away "server stays WASM-free" — and even then OBB-SAT keeps it WASM-free with exact collision. Compound-angle *joinery* (the cutter layer) remains genuine future work, but it's incremental per joint, never a rewrite of the pipeline.

---

## 1. Analytic core layer (no Manifold)

### 1a. Consolidate the box math → `core/src/geometry/aabb.ts`
Today the 90°-exact world-AABB lives in **two** places using THREE: [web/src/lib/collision.ts](../packages/web/src/lib/collision.ts) `worldAABB` and [web/src/viewport/bounds.ts](../packages/web/src/viewport/bounds.ts). Move the one true implementation into core as **plain TS** (core has no THREE dep — rotate the 8 corners with a small Euler-XYZ→matrix helper, or, since rotations are 90° multiples, an integer rotation matrix). Export:
- `worldAABB(board): AABB` — `{ min:[x,y,z], max:[x,y,z] }` (broadphase; conservative for non-90°, exact for 90°).
- **`worldOBB(board): OBB`** — `{ center, axes:[ux,uy,uz], halfExtents }`. Carry this on `BoardSolid` so a future OBB/CSG narrowphase has its inputs **with zero call-site churn** (angle-readiness insurance). For 90° boards it coincides with the AABB.
- `overlapRegion(a, b): AABB | null` — the intersection box (used by JointFns + preconditions). v1 body is AABB-intersection; swappable to OBB-clip later.
Web's `collision.ts` and `bounds.ts` re-export / call core (drop the duplicate math; keep web's THREE usage only where it needs `Vector3`).

### 1b. Joint preconditions → `core/src/geometry/preconditions.ts` (§4.2 step 3)
One predicate per joint type returning `{ ok: true } | { ok: false, reason: string }`. Reasons must **teach** (§11.4) — name the boards, the measured value, and the threshold. Per §5 "Requires" rows:

| Type | Requires |
|---|---|
| `butt` | face-to-face contact: overlap depth ≤ 1/64 on the contact axis, **no** penetration on the others |
| `rabbet` | `b` overlaps `a`'s edge region |
| `housing` | `b` penetrates `a`'s face by ≥ `depth` (default `t_a/3`) |
| `half_lap` | boards cross/end-lap: overlap > 0 in **both** plan dimensions |
| `bridle` | end-to-end or tee overlap, full-width engagement of `b` into `a` |
| `mortise_tenon` | end of `b` inside `a`; engagement ≥ **1/2"** |

Wire into [validateOps](../packages/core/src/validators.ts) **step 3** (the file already marks steps 3–4 as "chunk 9"). Runs for `add_joint`, `update_joint`, and `transform_board`/`update_board` that move a board participating in a joint (re-derive → may invalidate, §2.4 #3 → emit a warning, not an error, on an *existing* joint whose overlap no longer satisfies it).

### 1c. Collision authority → `core/src/geometry/collision.ts` (§6 step 4)
Port chunk 8's [recomputeWarnings](../packages/web/src/lib/collision.ts) into core. Route the per-pair test through a **`narrowphase(a, b): { intersects: boolean; volume: number }`** seam — the v1 body is analytic-AABB (`volume > COLLISION_VOL_EPS`, 1e-6 in³, §6 step 4), but **no call site assumes AABB**, so swapping in OBB-SAT or Manifold CSG later touches one function. Same governed-pair skip (enabled joint over `{a,b}`). This is the **single source** used by both server and client.

### 1d. Non-90° guard (angle-readiness insurance)
The analytic narrowphase is exact **only** for 90°-multiple rotations. A board can already get an odd rotation via MCP today. Add a cheap `isAxisAligned(board)` check; when a board in a candidate pair isn't axis-aligned, the AABB result is conservative (may over-report) — log/emit a soft note rather than silently asserting a collision. This keeps the door open for compound angles without v1 pretending its AABB math is exact for them.

---

## 2. Manifold carve pipeline (`@tenon/core/eval`)

### 2a. `manifold.ts` — init
`manifold-3d` is async WASM. `let mod; export async function getManifold() { mod ??= await Module(); mod.setup(); return mod }` — memoized, called once per worker. Pin the **exact** version in `package.json` (§16.5: no manifold-3d bump without a green golden run).

### 2b. `solids.ts`
- `baseSolid(board, ctx): Manifold` — axis-aligned box `l×w×t` at origin, **then** translated/rotated to world (Manifold `.transform`/`.translate`/`.rotate`). Apply board-level `edge_grooves` here (§3.4) as subtracted prisms **before** joints — a groove is a board feature, not a joint partner. (Panel auto-sizing/movement math deferred.)
- prism builders: `boxBetween(min, max)`, `slab(...)`, etc. — cutters are always axis-aligned prisms (the v1 constraint makes every cut a box subtraction Manifold handles robustly; §6 step 3).

### 2c. The `JointFn` contract (§5)
```ts
type JointFn = (a: BoardSolid, b: BoardSolid, params: P, ctx: EvalCtx) => {
  cuttersA: Manifold[]   // subtracted from a
  cuttersB: Manifold[]   // subtracted from b
  cutlist: CutlistAnnotation[]   // machining notes (consumed chunk 10)
  warnings: Warning[]    // THIN_TENON, THIN_MORTISE_WALL, NEAR_THROUGH, ...
}
type BoardSolid = { board: Board; solid: Manifold; aabb: AABB; obb: OBB }  // obb = angle-readiness insurance
type EvalCtx = { model: Model; tol: number /* 1/64 */; species?: ... }
```
All cutters in **world space**, contained within the target's bbox (Containment invariant, §6.1).

### 2d. `evaluate.ts` — pipeline (§6)
1. `baseSolid` per board (incl. edge grooves).
2. For each **enabled** joint: look up `JointFn` by type → collect `cuttersA/cuttersB`, annotations, warnings. (Skip + warn if precondition now fails.)
3. Per board: `base.subtract(union(cutters))` — **one batched boolean** per board.
4. Analytic collision pass → `core/geometry/collision` (NOT Manifold).
5. Extract indexed mesh + **face provenance** per board → transferable buffers.

`evaluate(model) → { boards: Map<id, EvalMesh>, warnings: Warning[] }`.

### 2e. `mesh.ts` — provenance + transferables
Each cutter carries a `CutFeature` tag (`{ id, kind: 'base'|'mortise'|'tenon_cheek'|'shoulder'|'rabbet'|'dado'|'groove'|'lap'|'slot'|'cheek', jointId? }`). Manifold's `originalID`/face-property channel maps output triangles → originating cutter; emit a per-mesh `CutFeature[]` table + a per-triangle `Uint16Array` index. Output `EvalMesh = { positions: Float32Array, normals: Float32Array, index: Uint32Array, provenance: Uint16Array, features: CutFeature[] }`; post all typed-array `.buffer`s in the worker transfer list. **Provenance is stored but unused until chunk 11** (face-pick → highlight joint) — document the contract; don't build the pick UI.

---

## 3. The six JointFns (cutter recipes, §5)

| Joint | cuttersA (receives) | cuttersB (inserts) | Key params / derivations | Warnings |
|---|---|---|---|---|
| `butt` | — | — | fastener markers = **ghost cylinders** (render-only, not subtracted); dowels → drilling cutlist note | — |
| `rabbet` | 1 prism along contacted edge | — | `depth` def `t_a/2`, `width` def `t_b` | — |
| `housing` | channel prism (dado/groove) | rabbets **iff** `shoulder` | `depth` def `t_a/3`; `stopped`→channel stops `stop_offset` short; dado/groove name from grain axis | — |
| `half_lap` | lower portion of overlap | upper portion | `split` def 0.5; `on_top` from world-Y of overlap (override). **Complement:** removed_a+removed_b = overlap vol | — |
| `bridle` | open slot (open mortise) | two cheeks | `tenon_fraction` def 1/3, snap 1/8; full-width | — |
| `mortise_tenon` | mortise pocket | shoulder + cheek prisms (+ square haunch relief) | `thickness` def `t_b/3` snap 1/16; `through` if engagement ≥ `t_a−1/64`; blind `depth` capped `t_a−1/4`; `width_shoulders` def `[3/8,3/8]`; `haunch_depth` ← stile `edge_groove.depth` (§3.4) | `THIN_MORTISE_WALL` (<1/4), `THIN_TENON` (<1/4), `NEAR_THROUGH` (blind within 1/8 of through) |

M&T `wedged`/`drawbore`/`twin`/sloped-haunch: parse & accept the params, **don't carve** them yet — emit `JOINT_FEATURE_UNIMPLEMENTED` warning (add to `core/common.ts` `WarningCode`) so the param round-trips and Claude/UI learns it's not yet geometric. Square haunch **is** carved.

---

## 4. Web worker + store integration

### Worker — `packages/web/src/workers/geometry.worker.ts`
- `new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' })`. Imports `@tenon/core/eval`, inits Manifold once on first message (warm it on designer mount).
- RPC: `{ reqId, model }` → `{ reqId, boards: [{id, positions, normals, index, provenance, features}], warnings }`, ArrayBuffers in the transfer list.
- **Latest-wins:** only the most recent eval matters; drop stale responses by `reqId`. One in-flight eval; coalesce rapid op bursts.

### Client — `lib/geometryClient.ts`
Thin promise wrapper around the worker (spawn lazily, like the designer code-split). `evaluate(model): Promise<EvalResult>`; rebuilds `BufferGeometry` from buffers on the main thread.

### Store — [modelStore.ts](../packages/web/src/lib/modelStore.ts)
- New `meshes: Map<boardId, EvalMesh | BufferGeometry>`; new action to (re)run the worker after every model set, async — viewport falls back to flat box for boards not yet in the map.
- **Warning authority switch** (the chunk 8 handoff hook): keep the client analytic pass (now `@tenon/core` `collision`) for **instant optimistic** feedback at dispatch time, then **adopt `result.warnings`** (server-authoritative, same core code → no flicker) on `ok`. Replace the `recomputeWarnings` import source (`./collision.js` → `@tenon/core`); the call sites at [modelStore.ts:88,98,112,115,124,167,311](../packages/web/src/lib/modelStore.ts) stay, swapping to server warnings on the `result.ok` branch.
- StrictMode: do **not** `dispose()` worker-built geometries in effect cleanup (handoff #12) — dispose on replacement / unmount only.

---

## 5. Viewport swap — `BoardMesh` (Viewport.tsx)
- If `meshes.get(board.id)` exists → render `<bufferGeometry>` from worker buffers; else `<boxGeometry l×w×t>` (current behavior, the fallback while the worker computes or for joint-free boards).
- Material unchanged: flat species color (physical, never themed — handoff #14); selection/hover **edge outlines** must derive from the carved geometry (re-run `EdgesGeometry` off the buffer mesh).
- Carry `provenance`/`features` on the mesh userData for chunk 11 — **no pick handler yet.**
- Transform: carved meshes come back **already in world space** (the evaluator transformed the base solid), so the mesh `Object3D` sits at the origin — the gizmo must move the *board* (emit `transform_board`) as today, not the mesh transform. Verify the gizmo still targets board position, not the now-world-baked geometry. (Alternative: evaluate in board-local space and keep the R3F transform — decide at implementation; world-space output is simpler for collision/provenance, local-space keeps the existing gizmo wiring. **Recommend local-space carve** so the existing transform/gizmo/snapping path is untouched — only the geometry source changes.)

> **Pin this at implementation:** evaluate per board in **board-local** coordinates (box centered at origin, grooves/joints carved in local space), keep the R3F `position`/`rotation` from `board.transform`. The analytic collision/preconditions still use **world** AABBs from `core/geometry`. This keeps chunk 7/8's gizmo + snapping wiring 100% intact; only `<boxGeometry>` → `<bufferGeometry>` changes.

---

## 6. Server integration ([routes/models.ts](../packages/server/src/routes/models.ts) + validators)
- `validateOps` **step 3**: call `core/geometry/preconditions` for joint-affecting ops → reject (`ok:false`, teaching reason) on hard failure; warn on soft re-derivation failure.
- After `applyOps` (**step 4**): run `core/geometry/collision` over the updated model → return in `OpResult.warnings` (currently `validation.warnings`, empty). [models.ts:153](../packages/server/src/routes/models.ts) → `warnings: collisionWarnings`. **No Manifold in Node** — analytic only. Whole-model O(n²) ≤ 100 boards is trivial.
- Server build (tsup, noExternal core) imports only base `@tenon/core` → no `manifold-3d` in the bundle. Verify `./eval` is **not** transitively pulled.

---

## 7. Tests (§6.1 — mandatory, the kernel-drift canary)
Pure core tests (vitest, node env, Manifold WASM inits in-process — verify manifold-3d loads under vitest first). `packages/core/src/eval/__tests__/`:

- **Golden** (`joints.golden.test.ts`): per joint type, a reference 2-board model → snapshot **volume + bounding box + vertex count** of each carved board. These catch silent kernel-output drift on a `manifold-3d` upgrade (§16.5 — no merge without a green golden run).
- **Property** (run against every JointFn):
  - **Containment** — every cutter ⊂ target board bbox.
  - **Volume** — removed volume = analytic expectation ± **0.001 in³** (M&T mortise = `thickness×width×depth`, rabbet = `depth×width×len`, …).
  - **Complement** — half-lap: `removed_a + removed_b = overlap_volume`.
  - **Idempotence** — evaluating twice → **bit-identical** meshes.
  - **Manifold validity** — `.status() === 'NoError'` for every output solid.
- **Analytic** (no WASM, fast): `aabb.test.ts` (intersectVolume/overlapRegion), `preconditions.test.ts` (each "requires" row: pass + teaching-reason fail), `collision.test.ts` (port chunk 8's cases to the volume epsilon; flush contact does **not** flag).
- Keep `clientOps.applyOpsLocal` ↔ server `applyOps` in lock-step (handoff #10) — chunk 9 adds no new ops, so no applier change.

---

## 8. Performance & memoization (§6 contract: full < 250 ms / incremental < 50 ms, ≤100 boards/≤200 joints)
- Ship **full re-evaluate + per-board memo**, keyed on `hash(board def + governing joints' params + mates' transforms)` — unaffected boards skip the carve. Manifold init is one-time (warm on mount).
- **Defer** true dirty-board incremental (only re-post changed boards) unless full re-eval misses 250 ms at target size. Measure first.
- Worker coalesces op bursts (latest-wins); never evaluates mid-drag (ops fire on mouseUp, as chunk 8).

---

## 9. Risks & gotchas
1. **manifold-3d in Vite/worker** — WASM must resolve relative to the worker URL. Likely needs `vite-plugin-wasm` (+`vite-plugin-top-level-await`) or the `manifold-3d/manifold.wasm?url` import pattern. **Verify the worker boots and carves one box before building all six joints** — this is the highest-uncertainty step; spike it first.
2. **manifold-3d under vitest (node)** — confirm `await Module()` resolves the `.wasm` in the test runner before writing the golden suite. If it fights, the property tests block the chunk.
3. **Kernel pin (§16.5)** — exact-pin `manifold-3d`; regenerate goldens deliberately, never on an incidental bump.
4. **Coplanar-face robustness** — cutter faces flush with board faces. Manifold is built for this (§6 step 3), but watch the `butt` flush-contact case and rabbet/dado shoulders; nudge by `tol` (1/64) only if a degenerate face appears — don't pre-emptively inset.
5. **Local vs world carve** — locked to **local-space carve** (§5 above) to preserve the gizmo path; collision stays world-AABB. Don't mix.
6. **StrictMode geometry disposal** (handoff #12) — dispose carved `BufferGeometry` on replace/unmount only, never in a memo-effect cleanup.
7. **Edge-groove ordering** — grooves carve in `baseSolid` **before** joints; M&T `haunch_depth` reads the stile's `edge_groove.depth` (§3.4 live derivation).

---

## 10. Tuning parameters (start here, iterate)
| Param | Default | Source |
|---|---|---|
| `COLLISION_VOL_EPS` | 1e-6 in³ | §6 step 4 |
| `CONTACT_TOL` | 1/64 in | §5 butt / through derivation |
| M&T `thickness` | `t_b/3`, snap 1/16 | §5.6 |
| M&T min engagement | 1/2 in | §5.6 requires |
| housing `depth` | `t_a/3` | §5.3 |
| rabbet `depth`/`width` | `t_a/2` / `t_b` | §5.2 |
| half_lap `split` | 0.5 | §5.4 |
| Volume test tol | 0.001 in³ | §6.1 |

---

## 11. Suggested implementation order (plan high, execute low — §15)
1. **Spike** manifold-3d in the worker + under vitest (gotchas #1/#2) — carve one box, snapshot its volume. Gate the chunk on this.
2. **Analytic core** (`geometry/aabb`, `preconditions`, `collision`) + their fast tests; wire `validateOps` step 3 and the server warning authority (§6). De-risks the no-WASM path independent of the carve.
3. **Eval skeleton** (`manifold`, `solids`, `evaluate`, `mesh`) carving base solids + edge grooves only (no joints) → worker → store → viewport swap with box fallback. Now boards render from the worker.
4. **JointFns in ship order** (§14): `housing` → `rabbet` → `half_lap` → `butt` → `bridle` → `mortise_tenon`, each with golden + property tests as it lands.
5. **Provenance** plumbing + memo + perf measurement; document the ch.11 face-pick contract.

---

## Acceptance criteria
- Two boards crossing with a `half_lap` joint render with complementary laps carved; removing the joint shows the `UNRESOLVED_COLLISION` lint again (server-authoritative).
- A rail tenoned into a stile (`mortise_tenon`, engagement ≥ 1/2") renders mortise + shouldered tenon; through vs blind derives correctly; thin walls/tenons warn.
- `validateOps` rejects an `add_joint` whose overlap fails the type's "requires" row with a **teaching** reason (names boards + measured value + threshold).
- All §6.1 invariants green (containment, volume ±0.001, complement, idempotence, manifold-validity); golden snapshots committed.
- Viewport renders carved meshes (box fallback for joint-free/un-evaluated boards); gizmo, snapping, selection outlines still work (chunk 7/8 path intact).
- Server bundle contains **no** `manifold-3d`; `corepack pnpm --filter @tenon/core test && --filter @tenon/web typecheck && --filter @tenon/server test` green.

---

## Spike results — 2026-06-14 (§11 step 1: GREEN → chunk unblocked)

The kernel-gating spike (gotchas #1/#2) is done. manifold-3d boots and carves a box in **all three** target environments, producing identical output:

| Env | How verified | Result |
|---|---|---|
| **vitest (node)** — gotcha #2 | `packages/core/src/eval/__tests__/spike.test.ts` | volume **6**, status `NoError`, 16 verts / 32 tris. **Works with zero config** — manifold.js reads the `.wasm` via `readFileSync(new URL("manifold.wasm", import.meta.url))` (node branch). No `locateFile` override needed. |
| **Vite dev (ES worker)** — gotcha #1 | `vite dev` + headless Chrome at `/spike.html` | Same carve, **~33 ms** worker-spawn→carve (incl. WASM init). |
| **Vite prod (rollup)** — gotcha #1 | `vite build` + `vite preview` + headless Chrome | Same carve. Rollup emits `manifold-<hash>.wasm` as an asset and rewrites the worker chunk's `new URL("manifold.wasm", import.meta.url)` → `new URL("/assets/manifold-<hash>.wasm", import.meta.url)`. |

**Versions (exact-pinned, §16.5):** `manifold-3d@3.5.1` (no caret) · vite 6.4.3 · vitest 2.1.9 · node 20.20.2 (repo wants ≥22 — engine **warning only**, manifold works on 20).

**The one config that matters (gotcha #1 resolution):** add `optimizeDeps: { exclude: ['manifold-3d'] }` to `vite.config.ts`. Without it, esbuild pre-bundles manifold into `.vite/deps/` *without* copying the sibling `.wasm`, which (a) breaks the `import.meta.url` resolution and (b) forces a mid-load re-optimize + page reload. Excluded, it's served as a real ESM module and the URL resolves against `node_modules`. **No `vite-plugin-wasm` / `vite-plugin-top-level-await` needed** — the gotcha #1 fallbacks the design listed are unnecessary at 3.5.1.

**Benign build warning:** `Module "node:module" has been externalized for browser compatibility, imported by manifold.js`. That's manifold's node-only `createRequire` branch (gated by `ENVIRONMENT_IS_NODE` at runtime); the browser path uses `fetch`. Safe to ignore.

**WASM init is one-time and cheap** — `getManifold()` (`packages/core/src/eval/manifold.ts`) memoizes the `Module()` + `setup()` promise; warm it on designer mount (§4) and per-eval cost is just the carve.

**Landed by the spike (KEEP — real chunk-9 infra):**
- `manifold-3d@3.5.1` dep + the `"./eval"` subpath export in `packages/core/package.json`.
- `packages/core/src/eval/manifold.ts` — `getManifold()`.
- `optimizeDeps.exclude: ['manifold-3d']` and `worker.format: 'es'` in `packages/web/vite.config.ts`.

**Throwaway scaffolding (DELETE when §11 step 3's `solids.ts`/`evaluate.ts` land):**
- `packages/core/src/eval/spike.ts` + `__tests__/spike.test.ts` (replaced by the §6.1 golden/property suite).
- `packages/web/spike.html`, `packages/web/src/spike-main.ts`, and the `'spike'` branch + `build.rollupOptions.input` spike entry in `vite.config.ts`.
- `packages/web/src/workers/geometry.worker.ts` currently carries only the spike RPC — replace its body with the real `evaluate(model)` RPC (keep the file + the `@tenon/core/eval` import).
