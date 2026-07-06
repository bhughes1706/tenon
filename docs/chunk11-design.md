# Chunk 11 — Joint dialog · lint-resolve flow · face-pick · MCP model loop · render_view

**Date:** 2026-07-02 · **Spec:** §5 (joint types), §11 (MCP), §13 (designer components), §19.2/19.3 (UX)
**Depends on:** chunk 9 (evaluator + provenance), chunk 10 (cut list)

Owner-approved scope decisions (2026-07-02 session):

1. **Joint selection includes face-click provenance picking** — not just outliner/lint rows.
2. **The full MCP model loop ships now**, not just `render_view`: `list_models`, `get_model`,
   `create_model`, `apply_model_ops`, `get_cutlist`, `validate_model` (pulled forward from
   chunk 13 — the REST pipeline exists; the tools are thin adapters over a shared service).
3. **The joint dialog's live preview is a separate mini-viewport** (small dedicated R3F canvas
   inside the dialog), not an in-scene ghost overlay.

---

## 1. What already exists (do NOT rebuild)

| Piece | Where | Note |
|---|---|---|
| Per-triangle provenance + feature table | `geometry.userData.provenance` (Uint16Array, index into `features`) + `userData.features` (`CutFeature[]`, `jointId?`) — set in `geometryClient.buildBoard` | The chunk-9 "chunk-11 contract". Non-indexed soup ⇒ `event.faceIndex` **is** the triangle index. |
| All-joints face overlay per board | `CarvedBoard.highlight` / store `jointMeshes` | Reused as-is by the mini-viewport (one joint in the candidate model ⇒ highlight *is* that joint). |
| `jointFaceMesh(mesh)` | `core/eval/jointFaces.ts` | Unchanged. The per-joint filtered variant lives web-side (`viewport/jointPick.ts` `extractJointFaces`) because it must run over the *retained* BufferGeometry+userData, not the EvalMesh. |
| Joint op pipeline + undo | `validators.ts` (typed param patches), `clientOps.ts` (`invertOps` handles add/update/remove_joint), server `applyOps` | Creation/edit/delete just dispatches ops — zero new op plumbing. |
| Preconditions with teaching reasons | `checkJointPrecondition(type, a, b, params)` (core, analytic) | Drives the dialog's type-picker filtering AND the hard add_joint gate. |
| `--vp-joint-hi` token + `jointMat` | `viewportResources.ts` | Selected-joint face tint reuses it. |
| View presets | `requestView('iso'|'front'|'top')` + `CameraRig` | Gains `'right'` (render_view needs it). |

## 2. Web — joint selection model

- Store gains `selectedJointId: string | null`, **mutually exclusive** with board `selection`
  (selecting either clears the other; `load()` resets it). Inspector branches on it.
- **Face-pick** (`viewport/jointPick.ts`, pure + tested): `pickJoint(geometry, faceIndex)` reads
  `userData.provenance/features` → `jointId | null`. Plain left-click in select mode on a joint-cut
  face selects the joint; base/groove faces (and the box fallback, which has no provenance) keep
  selecting the board. **Additive clicks (shift/⌘) always board-select** — joint pick is
  single-select only. Right-click on a joint face sets `menuTarget: 'joint'`.
- **Selected-joint tint**: `extractJointFaces(geometry, jointId)` builds a sub-geometry of just
  that joint's triangles per board (only a/b have any); rendered with `jointMat` like the global
  highlight overlay. Built in a `useMemo` with dispose-on-replace via ref (a discarded render
  worst-cases one re-upload — `dispose()` frees GPU buffers only, attributes stay usable).
- Outliner gains a **Joints section** (type · a↔b names, click to select, disabled joints dimmed).
  Lint rows become actionable: warnings with `joints` select the joint; `UNRESOLVED_COLLISION`
  rows select the pair and offer **“Resolve as joint…”** → opens the JointDialog (the §13 primary
  joint path).
- Keyboard: `J` (2 boards selected) opens the dialog; `Esc` clears joint selection before board
  selection; `⌫` on a selected joint dispatches `remove_joint`.
- Context menu: `CommandContext` += `'joint'`; commands `joint_toggle_enabled` + `joint_delete`
  tagged `['joint']`. (Spec's "Edit params" entry is the Inspector, which is already live on
  selection — no menu item needed.)

## 3. Web — JointInspector + JointDialog

- **`JointParamsForm`** (shared by Inspector + dialog): per-type forms exposing only params the
  JointFns consume — butt `fastener/count/dia`; rabbet `depth/width`; housing
  `depth/fit_allowance/stopped/stop_offset`; half_lap `split/on_top`; bridle
  `tenon_fraction/snap_to_tool`; mortise_tenon `thickness_fraction/thickness/snap_to_tool/depth/
  width_shoulders/through`. Deferred params (M&T haunch/wedged/drawbore/twin, housing shoulder)
  are **not shown** — they'd only warn `JOINT_FEATURE_UNIMPLEMENTED`. Optional numeric params show
  their geometry-derived default as placeholder; **once set, a param can't return to "auto"**
  (a merge patch can't delete a key; zod rejects null) — accepted v1 limitation, noted in the UI.
- **JointInspector** (joint selected): type label, a/b names (click→select board), enabled toggle,
  params form (commit-per-field `update_joint`, undoable), delete, plus this joint's lint.
- **JointDialog** (creation): store state `jointDialog: {a, b} | null`.
  - Type picker runs `checkJointPrecondition` per implemented type against the live boards;
    failing types are disabled **with the teaching reason shown**. box/dovetail/miter listed
    disabled ("later"). Preselect = first passing of
    `[mortise_tenon, housing, half_lap, bridle, rabbet, butt]` (butt always passes → last).
  - Role line per type (a receives: mortised/dadoed/rabbeted; b inserts) + **⇄ swap** re-runs
    preconditions.
  - Params accumulate locally; **Add joint** dispatches `add_joint` with explicit `makeJointId()`
    (invertible), selects the new joint on ok, shows the server's teaching error inline on reject.

## 4. Web — mini-viewport live preview (dialog)

Small `<Canvas>` in the dialog. On open/param-change (debounced ~150 ms) build a candidate model
`{boards: [a, b], joints: [pending], groups: []}` and `carve()` it through the **existing**
geometryClient worker: boards render at real transforms with species colors; the returned
`highlight` sub-geometry (this one joint) tints amber; OrbitControls; camera framed on the pair's
combined `worldAABB`. Worker contention is nil while the dialog is open (main model isn't
changing); candidate carves evict the eval-cache entries for those two boards → one ~ms recompute
after commit. Preview also surfaces: the worker's joint-geometry lint (THIN_TENON …) and a
**“✓ resolves the collision”** line when `recomputeWarnings(candidate)` drops the pair's
`UNRESOLVED_COLLISION`. Preview geometries dispose-on-replace + on close.

## 5. Server — model service + MCP model loop

`routes/models.ts`'s ops pipeline moves to **`lib/modelService.ts`** (`loadModel`, `createModel`,
`applyOpsCommit` — validate → applyOps → CAS write w/ name-column sync + snapshot → warnings →
SSE — plus `loadCutlistOpts`, `listModels`); the routes become thin adapters, and the MCP tools
call the same functions (single §4.2 pipeline, no drift). New tools (all base-core, WASM-free —
§6 server invariant holds):

`list_models(job_id?)` (+board/joint counts) · `get_model(model_id)` (full doc) ·
`create_model(name, job_id?)` · `apply_model_ops(model_id, expected_rev, ops)` (ops enter as
unknown[]; validateOps step 1 **is** the parse; returns the §4.2 OpResult verbatim — ok:false is
a *valid, teaching* response, not an MCP error) · `get_cutlist(model_id)` ·
`validate_model(model_id)` (warnings only). Mutating tools audit-log.

## 6. render_view (§11.3)

- **Client render mode:** `/designer/:id?render=<iso|front|top|right>&hl=<ids>` → `DesignerPage`
  renders a minimal `RenderShell` (Viewport only, no chrome/SSE/palette): loads the model, sets
  selection from `hl` (outline = highlight), requests the view, and flips
  `window.__tenonRenderReady = true` once every board's carved mesh has landed
  (`meshes.size === boards.length`; evaluate() emits a mesh for every board) + 2 rAFs.
- **Server:** `lib/renderView.ts` — lazy **singleton** Puppeteer browser (`headless`,
  `--use-angle=swiftshader` per the chunk-9 recipe, `--no-sandbox` under systemd), serialized
  render queue, navigates to the server's own SPA (`http://127.0.0.1:$PORT/...`), waits on the
  ready flag (15 s cap), screenshots the canvas clip → PNG. Route
  `GET /api/models/:id/render.png?view=&w=&highlight=` with its own **10/min** limiter (§16.6);
  MCP tool `render_view` returns an image content block.
- `puppeteer` (bundled Chromium) added to server deps, **pinned exact** (§16.5). Deploy note:
  first `npm install` on the mini PC downloads Chromium (~170 MB); Ubuntu needs the usual
  shared-lib apt packages.
- Dev caveat: render mode hits the **server-served built SPA** — `vite dev` won't do; build web
  first when verifying locally.

## 7. Tests

- web: `jointPick.test.ts` (pick + extract on synthetic geometry w/ userData);
  `jointTypes.test.ts` for the dialog's pure `availableJointTypes(a, b)` helper.
- core: `jointFaces` filter variant.
- server: `modelService` integration (temp-dir `openDb`): apply ok / rev conflict / validation
  reject / name-column sync / snapshot cadence; `list/create/cutlist` smoke.
- render_view: curl smoke against the locally built server (PNG magic bytes), documented here —
  not a vitest (needs browser + built web).

## 8. Non-goals (this chunk)

Box/dovetail/miter geometry (§5.7–5.9), M&T haunch/wedged/drawbore/twin carving, reset-param-to-
auto, joint hover states, phone bottom-sheet joint editing, thumbnails (chunk 14 keeps the rest),
`export_print_model`, `get_photo`/`update_species_cost` MCP tools.
