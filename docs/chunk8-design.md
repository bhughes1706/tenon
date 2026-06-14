# Chunk 8 — Design Mini-Spec

**Date:** 2026-06-13 · **Model:** Opus 4.8 · **Depends on:** chunk 7 (viewport)
**Spec refs:** §2.1 (units/snap), §2.2 (coords), §2.4 (overlap=engagement), §6 (evaluator/collision), §13 (designer components), §19.1–19.3 (registry/modes/layout/context menu)

Chunk 8 = **snapping (face/edge/end magnetism) + collision broadphase + outliner tree + right-click context menu.** Snapping is the make-or-break, judgment-heavy surface; the rest is well-bounded.

---

## Decisions locked in design session

| Decision | Choice |
|---|---|
| **Snap scope** | **Gizmo-move only.** Magnetism applies to the transform gizmo on existing boards. Add Board stays numeric-first (no ghost-drag placement). |
| **Context menu actions** | **Duplicate, Group, Ungroup, Delete** (+ empty-space: Add board, view presets). |
| **Outliner depth** | **Tree + group-from-selection.** Collapsible group tree, create/dissolve groups from selection, rename, click-to-select. **No drag-and-drop.** |
| **Group semantics** | **Selection / organization only.** Selecting a group selects its members. Gizmo stays single-board. |

**Explicitly out of scope (deferred):** Mirror X/Y/Z; Copy/Paste clipboard; Isolate view; outliner drag-and-drop; group/multi-board gizmo move; ghost-drag placement; joint context-menu entries (joints aren't clickable until ch.9/11); Manifold narrowphase collision (ch.9).

---

## 1. Snapping (face/edge/end magnetism)

### Model
v1 limits rotations to 90° multiples (§12), so **every board's world AABB is exact, not approximate.** Snapping operates on AABB features:
- **Faces** → the 6 axis-aligned planes (min/max on each axis).
- **Ends** → faces on the length axis (fall out of face snapping).
- **Edges/corners** → two or three axes snapping simultaneously (fall out of per-axis snapping).

This unification means we implement **per-axis plane snapping** and faces/edges/ends all emerge from it. This directly serves the overlap=engagement convention (§2.4): snap a rail end flush to a stile face, then nudge in to create the engagement overlap.

### Algorithm (in `TransformControls` `onObjectChange`, translate mode only)
1. **At drag start:** cache every *other* board's world AABB (they don't move) and the dragged board's AABB half-extents (fixed during a translate drag; only center moves).
2. **Disable built-in snap:** set `translationSnap={null}` on `TransformControls` — we own grid + magnetic so they don't fight (handoff already flags grid/magnetic fighting as the classic bug).
3. **Per axis (x, y, z), independently:**
   - Build candidate target coordinates from other boards' AABB `min`/`max`/`center` on that axis.
   - Build the dragged board's reference features on that axis: its `min`, `max`, `center`.
   - For each (reference feature → candidate target) pair, the delta is `target − feature`. Keep the smallest |delta|.
   - **Gate by perpendicular relevance:** only consider an other-board's candidate if the dragged AABB and that board's AABB overlap (or are within a small margin) on the *other two* axes. Prevents snapping to a board across the room.
   - If the smallest |delta|'s screen-projected distance < `SNAP_PX`, apply it (shift the dragged center so the feature lands on the target). Otherwise fall back to **grid snap** (`store.snapGrid`) on that axis.
4. Write the snapped position back to the dragged `Object3D` in the handler. Commit on `onMouseUp` exactly as today ([Viewport.tsx:176-198](packages/web/src/viewport/Viewport.tsx#L176-L198) `commitTransform`), but read the already-snapped position (drop the grid re-snap there since the handler did it).

### Parameters (defaults — tunable, snapping is iterative)
- `SNAP_PX = 8` — magnetic pull radius in **screen space** (constant feel across zoom). Convert to world per-axis at the snap location via the camera, or approximate as `k · orbitDistance` clamped to `[1/32", 1"]`. Start with the distance-scaled approximation; refine if feel is off.
- **Suspend modifier:** hold **Alt/Option** during drag → magnetism off (grid only), for free placement.
- **Precedence:** magnetic (within threshold) > grid > raw. Per-axis.

### Visual feedback (matters for make-or-break feel)
- When an axis is magnetically snapped, draw a thin **guide line** along the shared plane through the aligned features, plus small end markers.
- Add a `--vp-snap` theme token (light + dark) and a themed material in `viewportResources.ts` (§20.3 — overlay objects are themed; wood/species never are). Wire into `syncViewportTheme`.
- Guides are transient: shown only during an active drag with a live snap.

### Files
- [Viewport.tsx](packages/web/src/viewport/Viewport.tsx) — `onObjectChange` handler, drag-start AABB cache, guide rendering, `translationSnap={null}`.
- New `packages/web/src/viewport/snapping.ts` — pure snap solver: `solveSnap(draggedAABB, otherAABBs, snapGrid, worldThreshold) → { pos, guides }`. **Pure + unit-tested.**
- `viewportResources.ts` + `tokens.css` — `--vp-snap` token + material.

---

## 2. Collision broadphase

### Algorithm — `recomputeWarnings(model): Warning[]`
- World AABB per board (exact for 90°-rotated prisms).
- Pairwise (i < j): overlap on **all three** axes each `> COLLISION_EPS` → candidate collision.
- Skip the pair if an **enabled** joint governs it (`{j.a, j.b} == {a, b}`). (No joints created in the UI yet, but keep it correct for ch.11.)
- Emit `UNRESOLVED_COLLISION` (`@tenon/core` `WarningCode`) with `boards: [a, b]` and a message naming both boards.

### Why positive-overlap epsilon
Flush contact (a shelf resting on a side, a butt joint — 0 penetration) must **not** flag. Actual penetration **must** — that's the design-completeness signal that drives the joint flow (§2.4 #2). `COLLISION_EPS = 0.005"` on each axis (small float-noise margin).

### Where it runs / authority
- Client-side, recomputed after **every model mutation** (load, each successful op, undo, redo) — so optimistic edits show lint **instantly**, no server round-trip.
- Pure O(n²) ≤ 10k pairs for ≤100 boards — trivial. Never runs during a live drag (ops only fire on mouseUp).
- **Authority note:** ch.9 moves collision authority to the server's Manifold *narrowphase* via `OpResult.warnings`. Until then the client broadphase is the source. Document this at the call site so ch.9 knows to switch over.

### Files
- New `packages/web/src/lib/collision.ts` — `worldAABB(board)`, `recomputeWarnings(model)`. **Pure + unit-tested.** (Reuse the AABB-corner math from [bounds.ts](packages/web/src/viewport/bounds.ts).)
- [modelStore.ts](packages/web/src/lib/modelStore.ts) — call `recomputeWarnings` wherever `model` is set; set `warnings` alongside.

---

## 3. Outliner tree

Replace the flat `Outliner` in [DesignerShell.tsx:353](packages/web/src/ui/DesignerShell.tsx#L353):
- **Tree:** group nodes (collapsible) containing member boards; ungrouped boards at top level.
- **Group from selection:** "Group" action enabled when ≥2 boards selected → `group` op. **Ungroup** on a group node → `ungroup` op (ops already exist in core; `clientOps` already handles both, including invert).
- **Rename group:** inline edit → `group` carries `name`; renaming is ungroup+regroup or a future `update_group` (use existing ops: a rename = re-`group` with same id + new name is *not* clean. For ch.8, rename via dissolve+recreate is ugly — **defer rename** unless a clean path exists; group/ungroup + click-select is the committed surface).
- **Click-select:** click board → select; click group → select all members (additive with shift/meta as today).
- **No drag-and-drop.**

### Files
- [DesignerShell.tsx](packages/web/src/ui/DesignerShell.tsx) — `Outliner` rewrite (tree render + group/ungroup buttons).

> **Note on rename:** core has no `update_group`/`rename_group` op. Keep ch.8 to group/ungroup/select. If rename is wanted, it's a small core op addition — raise before building.

---

## 4. Right-click context menu

### Architecture (stays registry-driven, §19.1/§19.3)
1. **Extend `Command`** ([registry.ts:18](packages/web/src/lib/registry.ts#L18)) with optional `contexts?: CommandContext[]` where `type CommandContext = 'board' | 'multi' | 'empty'`. Purely additive — the palette's `filtered()` ignores it, so **non-breaking**.
2. **Add** `registry.forContext(target, ctx)` → commands whose `contexts` includes `target` **and** whose `when(ctx)` passes. This gives a *curated* menu (not every palette command — no "Toggle theme" in the right-click menu).
3. **Wire Radix** `@radix-ui/react-context-menu` around the viewport container + outliner rows. Determine target via the existing R3F pointer machinery:
   - `BoardMesh.onPointerDown` with `button === 2`: if the board isn't already in the selection, `setSelection([id])`; set `menuTarget = selection.length > 1 ? 'multi' : 'board'`; `stopPropagation` (so empty-miss doesn't fire). Don't `preventDefault` — let the native `contextmenu` reach Radix.
   - `Canvas.onPointerMissed` with `button === 2`: `menuTarget = 'empty'`, `clearSelection()`.
   - `pointerdown` fires before `contextmenu`, so `menuTarget` is set before Radix reads it.
   - Outliner rows set `menuTarget` similarly on their own context-menu handler.
4. Menu renders `registry.forContext(menuTarget, ctx)`, grouped, with icons + shortcuts. Each item calls `registry.execute(id, ctx)`.

### Menu entries (per §19.3, scoped to decisions)
| Target | Commands |
|---|---|
| **board** | Duplicate · Group (if part of multi) · Delete |
| **multi** | Duplicate · Group · Delete |
| **empty** | Add board · View preset submenu (iso/front/top) |
| group node (outliner) | Ungroup · Delete members |

### New commands (in [viewportCommands.ts](packages/web/src/lib/viewportCommands.ts))
- **`duplicate`** — copy each selected board as an **`add_board`** op (new explicit `makeBoardId()`, offset e.g. `[2,0,2]` or one grid unit, `name` suffixed). **Not** the `duplicate_board` op (non-invertible — handoff #11). Multi-select → one `add_board` per board, dispatched as one batch (single undo entry). Select the new copies after.
- **`group`** — `group` op over current selection (`when: selection.length >= 2`). `contexts: ['multi']`.
- **`ungroup`** — `ungroup` op (from outliner group node).
- Existing **`delete_selection`** gets `contexts: ['board','multi']`; **`add_board`** gets `contexts: ['empty']`; view presets get `contexts: ['empty']`.

### Files
- [registry.ts](packages/web/src/lib/registry.ts) — `CommandContext` type, `contexts` field, `forContext()`.
- [viewportCommands.ts](packages/web/src/lib/viewportCommands.ts) — `duplicate`, `group`, `ungroup`; `contexts` tags on existing commands.
- New `packages/web/src/ui/ViewportContextMenu.tsx` — Radix menu component.
- [Viewport.tsx](packages/web/src/viewport/Viewport.tsx) — right-button selection + `menuTarget` plumbing.
- [modelStore.ts](packages/web/src/lib/modelStore.ts) — `menuTarget` state + setter; `duplicateSelected()` / `groupSelected()` actions.

---

## Store changes summary ([modelStore.ts](packages/web/src/lib/modelStore.ts))
- `warnings` now populated by `recomputeWarnings` on every model set.
- `menuTarget: 'board' | 'multi' | 'empty' | null` + setter.
- Actions: `duplicateSelected()`, `groupSelected()`, `ungroup(groupId)`.
- (No isolate/clipboard state — deferred.)

## Tests
- `snapping.test.ts` — per-axis face/edge/end snap, perpendicular gating, grid fallback, suspend, threshold boundary.
- `collision.test.ts` — penetration flags; flush contact (0 overlap) does **not**; joint-governed pair skipped; epsilon boundary.
- `clientOps.test.ts` — extend: `duplicate` as add_board round-trips undo; group/ungroup already covered.
- Keep `applyOpsLocal` ↔ server `applyOps` in lock-step (handoff #10) — duplicate uses add_board so no server applier change needed.

## Tuning parameters (start here, iterate)
| Param | Default |
|---|---|
| `SNAP_PX` | 8 px |
| suspend modifier | Alt/Option |
| `COLLISION_EPS` | 0.005 in |
| duplicate offset | one grid unit (or `[2,0,2]`) |

## Acceptance criteria
- Drag a board near another → its face/edge/end snaps flush with a visible guide; Alt suspends to free placement; off-threshold falls back to grid.
- Overlapping (penetrating) two boards raises an `UNRESOLVED_COLLISION` lint instantly (badge + lint panel); flush contact does not.
- Outliner shows a group tree; select ≥2 boards → Group; group node → Ungroup; clicking a group selects its members.
- Right-click a board → Duplicate / Group / Delete; right-click empty → Add board / view presets; all entries are registry-driven and also reachable via ⌘K.
- `corepack pnpm --filter @tenon/web typecheck && test` green; no R3F StrictMode disposal regressions (handoff #12).
