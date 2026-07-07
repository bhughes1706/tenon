# Chunk 17 — Router mode: bit store + edge profiles (design + derivation)

**Status:** PLANNED (Sonnet 5 planning session 2026-07-07) — not yet implemented. Hand
to Opus 4.8 with this doc as ground truth once chunk 16 is committed (see §7, file
overlap). The derivation problem the §15 table calls out — a curved cross-section
cutter, the first non-box/non-frustum primitive — is solved in §2/§3.

**Derivation verified (Fable 5 pass, 2026-07-07):** the §2 curve constructions and the
§1 sign table check out against `edgeGrooveCutters`; four errors in the original draft
were corrected in place — the roundover fixture's midpoint angle (was 135°, is 225°),
the cove fixture's midpoint angle (was "same as roundover", is 45°), the interior-point
invariant (strict `< reach`/`< depth` is violated by rabbet's corner point — now `≤`),
and the §3 overcut cap (was "two points", which leaves a flush-face skin along one
face — now an explicit three-point cap). Arc parametrizations are now given with exact
start/end angles so the fixtures can be derived verbatim.

**Insertion note (2026-07-07):** new row 17, inserted ahead of the bid engine (now row
18) for the same reason chunk 16 was: edge treatments matter more near-term than
billing, and this chunk has no dependency on the bid engine. Downstream chunks
renumbered: 3D print export 17.5→18.5, profiles/turnings 18→19, polish 19→20. See spec
§15 for the renumbered table.

Spec authority: §3.5 (edge profiles, new this chunk), §3.4 (edge grooves — the
board-level-feature precedent this mirrors), §9 (`bits` table), §19.2 (router mode,
fourth viewport mode). Schemas are new this chunk (`EdgeProfileSchema` in `board.ts`,
`bits` migration) — chunk 2 predates this feature.

**One new cutter primitive**: every existing cutter is a `CutterBox` (axis-aligned
prism) or `CutterFrustum` (linear taper between two rects, chunk 12). A router profile's
cross-section is curved (roundover/cove/ogee) or a multi-segment polyline (rabbet) swept
along the arris — neither fits. This chunk adds `CutterProfile`: a 2D cross-section
polyline extruded along the sweep axis. That is the big de-risk of this chunk, same role
chunk 16's "no new primitives" note played in reverse.

All lengths in inches, as everywhere in `core`.

---

## 1. Arris frame + addressing

A board has 8 **arrises** — an `edge` (`top`/`bottom`/`left`/`right`, the existing
`edge_grooves` enum, §3.4) × `face` (`front` = +thickness/+z, `back` = −thickness/−z,
board-local). This is coarser than the 12 true edges of a rectangular prism (it omits
the 4 end-grain verticals between `left`/`right` and `top`/`bottom`) but matches how a
router is actually run: along the long/end faces, on a chosen show face.

**Arris (corner) frame**, local to one arris: origin at the arris line itself,
+u pointing into the board along the edge's cross-grain normal (the direction
`edge_grooves`' `depth` already cuts along), +v pointing into the board along the
face's thickness normal. The board fills the u ≥ 0, v ≥ 0 quadrant near the corner; the
two flush faces meeting at this arris are the u = 0 line and the v = 0 line.

Mapping arris → board-local axes (mirrors `edgeGrooveCutters`'s edge convention,
`eval/solids.ts:110-116`, extended with the face axis):

| edge | sweep axis | span | u sign (edge → board-local) |
|---|---|---|---|
| `top` | 0 (x, length) | `[−l/2, l/2]` | +1 (cuts toward −y) |
| `bottom` | 0 (x, length) | `[−l/2, l/2]` | −1 (cuts toward +y) |
| `left` | 1 (y, width) | `[−w/2, w/2]` | −1 (cuts toward +x) |
| `right` | 1 (y, width) | `[−w/2, w/2]` | +1 (cuts toward −x) |

| face | v sign (edge → board-local z) |
|---|---|
| `front` | +1 (cuts toward −z) |
| `back` | −1 (cuts toward +z) |

(u/v sign convention: +1 means the arris sits at the *positive* extreme of that
board-local axis and the cut reaches back toward the origin — same "corner sign"
pattern as `frustumRectAxes`, generalized to a per-axis ±1 pair.)

## 2. Profile cross-section curves (`eval/profiles.ts`, pure, WASM-free)

Each profile type is a function of its arris-frame extents into a curve. Doctrine per
`eval/joints/spacing.ts`: numbers in, polyline out, no WASM, unit-testable standalone —
same reasoning as chunk 16 §1's solver/carve split.

`PROFILE_FACETS = 16` facets per profile curve — fixed (not arc-length-adaptive), so
`carveKey` stays stable and golden snapshots stay deterministic across machines.
Roundover/cove spend all 16 on their single 90° arc; ogee splits 8 + 8 across its two
half-radius arcs — every curved profile is exactly `PROFILE_FACETS + 1` points.

`profileCurve(p: EdgeProfile): [number, number][]` — an open polyline in arris-frame
(u, v), the removed cross-section's boundary from the v = 0 face to the u = 0 face:

All arcs are sampled as `P(θ) = center + radius·(cos θ, sin θ)` at evenly spaced θ:

- **roundover** (radius `r`): arc from `(r, 0)` to `(0, r)`, center `(r, r)`, radius
  `r`, θ running **270° → 180°**, sampled at `PROFILE_FACETS + 1` points. Convex from
  the remaining-material side (rounds the corner off).
- **chamfer** (width `w`, 45° implied): two points, `[(w, 0), (0, w)]` — no interior
  sampling needed, it's a straight cut.
- **cove** (radius `r`): arc from `(r, 0)` to `(0, r)`, center `(0, 0)` (the arris
  itself), radius `r`, θ running **0° → 90°** — concave scoop, the mirror-image
  curvature of roundover.
- **ogee** (radius `r`, Roman ogee): S-curve, two `r/2` arcs. First arc center
  `(r/2, 0)`, radius `r/2`, θ running **0° → 90°**: from `(r, 0)` to `(r/2, r/2)`,
  convex. Second arc center `(r/2, r)`, radius `r/2`, θ running **270° → 180°**: from
  `(r/2, r/2)` to `(0, r)`, concave. `PROFILE_FACETS/2 + 1` points per arc, sharing
  the midpoint — `PROFILE_FACETS + 1` points total.
- **rabbet** (width `w`, depth `d`): three points, `[(w, 0), (w, d), (0, d)]` — a step,
  not a taper (distinguishes it from the two-board `rabbet` *joint*, chunk 10, which
  cuts a shoulder between two boards; this is a single-board edge feature).

**Invariants** (unit-tested, mirroring chunk 16's fixture doctrine): every curve's first
point has `v = 0` and lies on the u-axis at `u = reach`; every curve's last point has
`u = 0` and lies on the v-axis at `v = depth`; every interior point satisfies
`0 < u ≤ reach` and `0 < v ≤ depth` — never past the extent box, and never on either
axis (only the two endpoints touch the faces). The upper bounds must be `≤`, not `<`:
rabbet's middle point sits exactly at `(reach, depth)`. The three arc profiles do stay
strictly inside.

`profileExtents(p: EdgeProfile): { reach: number; depth: number }` (in
`geometry/edgeProfiles.ts`, alongside validation — see §4): `{ reach: r, depth: r }`
for roundover/cove/ogee, `{ w, w }` for chamfer, `{ width, depth }` for rabbet.

**Worked fixtures** (unit tests, `toBeCloseTo(…, 10)`):
- roundover `r = 0.25`: arc midpoint at `(r − r·√2/2, r − r·√2/2)` ≈
  `(0.0732233…, 0.0732233…)` (arc center `(r,r)`, radius `r`, θ spans 270° → 180° so
  the midpoint is at θ = **225°** — derive verbatim in the test from
  `center + r·(cos θ, sin θ)`, θ = 225°).
- cove `r = 0.25`: center `(0,0)`, θ spans 0° → 90°, midpoint at θ = **45°** →
  `(r·√2/2, r·√2/2)` ≈ `(0.1767767…, 0.1767767…)` — sanity check: cove's midpoint is
  *further* from the arris than roundover's, since it curves away from material
  instead of into it.
- ogee `r = 0.25`: exact midpoint `(r/2, r/2) = (0.125, 0.125)`, shared by both arcs by
  construction — assert both arc parametrizations hit this point exactly.
- rabbet `w = 0.375, d = 0.1875`: exactly `[(0.375, 0), (0.375, 0.1875), (0, 0.1875)]`,
  no arc sampling.

## 3. Cutter placement + carve (`eval/types.ts`, `eval/solids.ts`, `eval/evaluate.ts`)

**New cutter variant** (`eval/types.ts`), alongside `CutterBox`/`CutterFrustum`:

```ts
export interface CutterProfile {
  profileCut: true                 // discriminant, like frustum's `frustum: true`
  axis: 0 | 1                      // sweep axis (see §1 table)
  span: [number, number]           // full arris run — exact; overcut is added at build time, not baked into span
  corner: [1 | -1, 1 | -1]         // [u sign, v sign] from §1
  curve: [number, number][]        // profileCurve(p) output, in ARRIS-FRAME (u, v) — sign-free
  feature: CutFeatureKind          // 'edge_profile' for all five types
  edgeProfileId?: string           // provenance: which board.edge_profiles[] entry
  jointId?: string                 // always undefined here; kept for Cutter-union uniformity
}
export type Cutter = CutterBox | CutterFrustum | CutterProfile
export const isProfile = (c: Cutter): c is CutterProfile => 'profileCut' in c
```

`cutterBounds` gains a profile branch: sweep-axis range = `span`; the two cross axes'
ranges run from the arris (at the board's ±half-extent on that axis) inward by
`max(curve.map(u))` / `max(curve.map(v))` respectively — per the §2 invariants this
AABB contains the cutter's entire in-board volume. (The built manifold's overcut cap
pokes past the flush faces, *outside* the board — irrelevant to the on-board
`PROFILE_JOINT_OVERLAP` check these bounds exist for, so don't assert bounds ⊇ built
manifold in tests.)

Storing `curve` in **arris-frame, not board-local** is the key simplification: the pure
math in §2 never needs to know which of the 8 arrises it's for. `axis` + `corner` do
all the sign/placement work, exactly like `CutterFrustum` separates "which axes" from
"what shape."

**`edgeProfileCutters(board): CutterProfile[]`** (`eval/solids.ts`, mirrors
`edgeGrooveCutters` at :117): for each `board.edge_profiles ?? []`, look up `axis`/`span`
from `edge` and `corner` from `edge` (u) + `face` (v) per the §1 table, call
`profileCurve(p)` for `curve`, set `feature: 'edge_profile'`, `edgeProfileId: p.id`.

**`buildProfileCutter(M, c, board)`** (`eval/solids.ts`, mirrors `buildFrustumCutter`
at :96):
1. Map each arris-frame `(u, v)` point to board-local cross-section coordinates:
   `crossU = corner[0] > 0 ? (halfExtentU − u) : (−halfExtentU + u)`, same pattern for
   `crossV` — this is where the sign convention actually resolves into a concrete
   polygon.
2. Close the polygon around the *outside* of the corner with an overcut cap of
   **three** points, given in arris-frame coordinates and mapped exactly like the
   curve points in step 1: `(−OVERCUT, depth)`, `(−OVERCUT, −OVERCUT)`,
   `(reach, −OVERCUT)`. Three, not two: the rectangular cap clears *both* flush faces
   by a full `OVERCUT` along their entire run, whereas a two-point cap's diagonal
   closing edge leaves part of one face flush — the zero-thickness-skin failure
   `OVERCUT` exists to prevent. **Append additional vertices, do not translate the
   existing flush-face vertices**, or the arc's tangent endpoints (which must land
   exactly on the flush faces per the §2 invariant) get displaced and the surface is no
   longer the bit's true profile. Same gotcha as `overcutToBoard`, applied to a polygon
   cap instead of a box face. (Curve + cap in this order is CCW in the arris frame;
   see step 5 for what the step-1 mapping does to that.)
3. `M.extrude(polygon, spanLen + 2·OVERCUT)` (extrudes along local +z of the polygon's
   own frame), then apply the one rotation that maps the extrusion's local z onto the
   board's `axis`, mapping the polygon's local (x, y) onto the two cross axes in
   ascending order (same convention as `frustumRectAxes`) — a single 90°-multiple
   rotation, no shear.
4. Translate so the extrusion spans `[span[0] − OVERCUT, span[1] + OVERCUT]` along
   `axis`.
5. **Winding**: the polygon's vertex order must be consistent (CCW as manifold-3d's
   `CrossSection` expects) after the corner-sign mapping in step 1 — the mapping
   reverses winding exactly when `corner[0] · corner[1] = −1` (a one-axis reflection;
   both-flipped is a 180° rotation and preserves it), so it's easy to get right for one
   arris and wrong for the mirror-image one. Normalize winding (signed-area check,
   reverse if negative) after building the polygon, before `extrude`. This is the step most likely
   to silently produce an inverted/degenerate cutter — test all 8 arrises, not one
   representative case (§6).
6. `asOriginal()` before returning, regardless of whether the transform chain preserves
   an original ID (matches `buildFrustumCutter`'s defensive call).

Ends are always full-overcut in v1 — no stopped/partial-length routing (§8) — so no
per-end flush test is needed; `OVERCUT` is simply added to both ends of the extrusion.

**`evaluate.ts` integration**:
- Cutter seed (:63): `cuttersByBoard.set(board.id, [...edgeGrooveCutters(board), ...edgeProfileCutters(board)])`.
- `carveKey` (:45): profile branch — `['P', c.axis, c.span, c.corner, c.curve, c.feature, c.edgeProfileId ?? null]`. Pure data, so unrelated boards keep cache-hitting.
- `evaluateBoard` build dispatch: third branch, `isProfile(cutter) ? buildProfileCutter(M, cutter, board) : …`; carry `edgeProfileId` onto the emitted `CutFeature`.
- **`PROFILE_JOINT_OVERLAP` check** (new pass, after joint cutters are stamped onto a board's cutter list, before the carve): for each `CutterProfile` on a board, AABB-intersect its `cutterBounds` against every joint-originated cutter's bounds on the *same* board (`jointId != null`). On overlap, push a soft warning naming the board, the arris (`edge`/`face`), and the joint id/type — carve still proceeds (lenient doctrine, same as every joinery warning in chunks 9-16). Bounds-level (conservative — may warn on a near-miss) is an accepted v1 approximation; no exact solid-intersection test.

**`CutFeatureKind`** gains `'edge_profile'` (additive, one kind for all five profile
types — the concrete type is recoverable from `board.edge_profiles` via
`CutFeature.edgeProfileId`, not from the kind enum). **`CutFeature`** gains
`edgeProfileId?: string`, mirroring `jointId?: string`.

## 4. Validation (`geometry/edgeProfiles.ts`, `validators.ts`)

`checkEdgeProfiles(board): string[]` — teaching-grade messages (§11.4 doctrine), called
from `validators.ts`'s existing post-batch board-reconstruction pass (the one that
already rebuilds final board state for joint preconditions, ~:91) for every board
touched by `add_board`/`update_board`:

1. **Duplicate arris**: two entries with the same `edge` + `face`. ("⟨board⟩ already
   has a profile on its ⟨edge⟩ ⟨face⟩ arris — remove it first, or edit that entry
   instead of adding a second one.")
2. **Depth overrun**: `profileExtents(p).depth >= board.dims.t`. ("A ⟨depth⟩ deep
   ⟨profile⟩ won't fit in a ⟨t⟩ thick board — it would cut through. Use a smaller bit
   or a thicker board.")
3. **Reach overrun**: `profileExtents(p).reach >= dims.w/2` for `top`/`bottom` arrises,
   `>= dims.l/2` for `left`/`right`. ("A ⟨reach⟩ reach ⟨profile⟩ on the ⟨edge⟩ edge
   would meet itself across a ⟨dims.w or dims.l⟩ ⟨wide/long⟩ board — reduce the bit
   size or the board dimension.")
4. **`panel_fit` boards rejected outright**: any `edge_profiles` entry on a board with
   `panel_fit` set is an error. ("⟨board⟩ is a floating panel — its dims are the
   opening size (§3.4), not the milled blank, so a router profile here doesn't
   correspond to a real edge. Route the frame members instead.")

No server `applyOps.ts` change: `update_board`'s generic patch spread already replaces
`edge_profiles` whole, same as `edge_grooves` today.

## 5. Bit store (server + web)

`bits` table per spec §9 — seeded with ~11 common bits (roundovers 1/8"–1/2", chamfer
45° at two widths, coves 1/4"/1/2", Roman ogees 5/32"/1/4", rabbeting 3/8"), migration
`002_bits.sql` (forward-only runner, `db.ts:24-54`, picks up any `NNN_*.sql` above
`user_version` — do not touch `001_init.sql`). `routes/bits.ts` mirrors
`routes/species.ts`: `GET /`, `GET /:id`, `POST`, `PATCH /:id`. Web `lib/bitsApi.ts`
mirrors `speciesApi.ts` (module cache + `useBits()`), plus `addBit`/`updateBit` that
reset the cache — species never needed writes from the designer, bits do (users curate
their own inventory).

**Bit → `EdgeProfile` mapping** (in the web router panel, not core — the store is
inventory, not a geometry dependency, per §3.5): roundover/cove/ogee → `radius: bit.radius`;
chamfer → `width: bit.cut_width` (45° fixed); rabbet → `width: bit.cut_width`,
`depth`: user-adjustable up to `bit.cut_depth` (defaults to half, rounded to 1/16",
exposed as the one parameter the router panel lets the user tune per application —
real rabbeting bits cut a fixed width but shops vary the depth per joint).

## 6. Tests

- `eval/__tests__/profiles.test.ts`: §2 fixtures verbatim (roundover/cove midpoint
  angles, ogee shared midpoint, rabbet exact points); endpoint-on-axis invariant for
  all five types at several radii/widths; `edgeProfileCutters` table-driven over all 8
  arrises (axis, span, corner signs) — no WASM.
- Extend `eval/__tests__/evaluate.test.ts` / `joints.golden.test.ts`: single-roundover
  board produces an `'edge_profile'` feature with the right `edgeProfileId`; **all 8
  arrises × the ogee profile carve with a strictly-positive volume removed from the
  correct corner only** (the winding-regression case called out in §3 step 5); two
  adjacent profiles on the same board (e.g. `top`/`front` roundover +
  `right`/`front` chamfer) carve without manifold errors; `PROFILE_JOINT_OVERLAP` fires
  when a profile's bounds overlap a dovetail's cutter bounds and stays silent on a
  clear board; memo test — patching one board's `edge_profiles` changes its
  `carveKey` and leaves sibling boards cache-hit (mirrors `memo.test.ts`).
- `validators.test.ts`: depth/reach-overrun rejections with the exact teaching text;
  duplicate-arris rejection; `panel_fit` board rejection; a valid patch round-trips
  with `bit_id` defaulted to `null`.
- `cutlist/__tests__`: one note-string fixture per profile type; identical note on two
  arrises collapses to `×2`; two otherwise-identical boards differing only in routing
  do not merge into one cutlist row.
- `viewport/arrisPick.test.ts` (web): table of board-local click points → expected
  `{edge, face}`, including points near the true midline between two candidate arrises.

## 7. Files

**core** — `board.ts` (`EdgeProfileSchema`, `BoardSchema.edge_profiles`), `ids.ts`
(`makeEdgeProfileId`), `geometry/edgeProfiles.ts` (new: `profileExtents`,
`checkEdgeProfiles`), `eval/profiles.ts` (new: `profileCurve`, `PROFILE_FACETS`),
`eval/types.ts` (`CutterProfile`, `isProfile`, `'edge_profile'` kind,
`CutFeature.edgeProfileId`), `eval/solids.ts` (`edgeProfileCutters`,
`buildProfileCutter`), `eval/evaluate.ts` (seed cutters, `carveKey`, build dispatch,
`PROFILE_JOINT_OVERLAP` pass), `eval/index.ts` (exports), `validators.ts`
(`checkEdgeProfiles` call site), `common.ts` (`PROFILE_JOINT_OVERLAP` code),
`cutlist/notes.ts` (per-profile note formatter). **server** —
`migrations/002_bits.sql`, `routes/bits.ts`, `src/index.ts` (mount `/api/bits`).
**web** — `lib/bitsApi.ts`, `lib/modelStore.ts` (`'router'` mode, `routerBitId`,
`setRouterBit`), `lib/registry.ts` (`AppCtx.mode`, stub command), viewport commands
(`router` command, shortcut `E`), `ui/DesignerShell.tsx` (rail button, keydown, mode
hint), `viewport/arrisPick.ts` (new: `pickArris`), `viewport/Viewport.tsx` (router
pointer branch, hover/applied arris overlays), `lib/routerApply.ts` (new: paint/toggle
logic), `ui/RouterPanel.tsx` (new: bit picker + add-bit form), `ui/Inspector.tsx`
(routed-edges section, rendering stored params not the live bit). **tests** — see §6.

## 8. Explicitly out of scope

- Stopped / partial-length routing (`stop_near`/`stop_far`, the `edge_grooves`
  pattern) — every profile runs the full arris in v1.
- Non-45° chamfers — schema stores `width` only; an `angle` field is a cheap additive
  extension later, not built now.
- Miter/corner-blending logic where two profiles meet — plain overlap-subtract is
  physically correct (§3.5) and is the permanent behavior, not a v1 shortcut.
- Profile × `edge_groove` overlap warning (only profile × **joint** is checked, §3
  step "PROFILE_JOINT_OVERLAP") — a cheap follow-up if it turns out to matter.
- Live pre-commit preview dialog (JointDialog-style) — router mode is a paint model;
  the viewport carve *is* the preview, one undo away.
- Full 12-arris addressing (the 4 end-grain verticals) — 8 arrises (§1) covers how a
  router is actually run.
- Bit-store edit UI beyond add — `PATCH /api/bits/:id` exists server-side; a full
  edit form in the designer is a follow-up if the add-only flow proves insufficient.
