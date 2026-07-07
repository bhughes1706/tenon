# Chunk 12 — Mortise & tenon, full §5.6 (design + derivation)

**Status:** COMPLETE (derived + implemented 2026-07-06, Fable 5 session; core 186 / web 89 /
server 27 tests green). Implements the four sub-features
chunk 10 deferred: **haunch** (square + sloped, depth derived from live `edge_grooves`),
**wedged** (mortise exit flare + tenon kerfs), **drawbore** (notes + ghost pin, no carve),
**twin** (two tenons across b's width). Core M&T (thickness/through/depth/width_shoulders/
snap/warnings) shipped in chunk 10 and is unchanged except where noted.

Spec authority: §5.6 (param table), §3.4 (edge grooves + "haunch_depth = the governing
`edge_groove.depth` on the stile — a live derivation, not a magic number"), §6.1 (invariants).

Frame conventions as in `eval/joints/mortiseTenon.ts`: pair frame (= a's local frame),
`eAxis` = insertion (b's length), `tAxis` = tenon thickness (b's thickness), `wAxis` = tenon
width, `R` = overlap box. `shoulderLine` = the R face along `eAxis` nearer b's body;
`tenon end` = b's end face. All §5.6 params already exist in `MortiseTenonParamsSchema`
(chunk 2) — note the schema names `drawbore_offset` (spec table says `offset`).

---

## 1. New cutter primitive: `CutterFrustum`

Two of the four features are not boxes: the wedged mortise's end walls taper (+1/8 per side
at the exit face) and the sloped haunch tapers to zero at the board edge. Both are **linear
sweeps between two axis-aligned rectangles** — convex, 8 vertices, exact.

```ts
// eval/types.ts
export interface CutterFrustum {
  frustum: true               // discriminant ('frustum' in c)
  axis: 0 | 1 | 2             // sweep axis k
  span: [number, number]      // stations along k (lo, hi)
  rectLo: { min: [number, number]; max: [number, number] } // rect at span[0]
  rectHi: { min: [number, number]; max: [number, number] } // rect at span[1]
  feature: CutFeatureKind
  jointId?: string
}
export type Cutter = CutterBox | CutterFrustum
```

Rect coords are the other two axes **in ascending axis order** (axis 1 → rect axes [0, 2]).
`CutterBox` is untouched (no `kind` field — every existing JointFn keeps compiling).

- **Build** (`solids.ts buildFrustumCutter`): 8 corners → `Manifold.hull(points)`, then
  `.asOriginal()` so the hulled solid owns an `originalID` for face provenance.
- **Overcut** (gotcha #4), two rules only — they cover both uses; a rect bound flush at
  exactly one station does not occur in the geometry we emit and stays exact:
  - a station plane flush with (or past) a board face → pushed out by `OVERCUT`, rect kept;
  - a rect bound flush at **both** stations → pushed out on both rects.
- **Carve key**: frustums serialize into `carveKey` as
  `[axis, span, rectLo, rectHi, feature, jointId]` — memo invalidation just works.
- **Reframe to the target board** (`util.ts toLocalFrustum`): map the 8 corners through the
  same pair→local transform `toLocal` uses (a signed permutation for mutually-square pairs),
  regroup by station, rebuild. Handles axis remap, station flips, and rect min/max swaps
  without case analysis.
- **Analytic volume** (for tests): only one rect dimension varies in every cutter we emit, so
  area is linear in the station and `V = |span| × ((A_lo + A_hi) / 2)` is exact.

New `CutFeatureKind`: `'kerf'` (wedge kerfs). No web code switches on the kind, so additive.

## 2. Haunch (`haunch: "square" | "sloped"`)

The haunch is a short stub left on the tenon that fills the exposed run-out of the stile's
panel groove at the stile's end (square), or an anti-twist ramp hidden from the end grain
(sloped). Three derivations:

**a. Haunch side** (which end of the tenon width). The stub belongs where the stile ends:
`marginLo = R.min[wAxis] − a.aabb.min[wAxis]`, `marginHi = a.aabb.max[wAxis] − R.max[wAxis]`;
side = the smaller margin (a flush frame corner gives 0). No rejection when neither is small —
a mid-stile haunch is legitimate (wide-rail anti-twist).

**b. Governing groove** (the §3.4 live derivation). The tenon enters a through one face along
`eAxis`; because the pair frame **is** a's local frame, that face maps directly to a groove
`edge` name: axis 1 → `top`/`bottom` (+/−), axis 0 → `right`/`left` (+/−), axis 2 → thickness
faces, no groove possible. Candidates = a's `edge_grooves` on that edge whose slot band
(`offset ± width/2`, along a-local z — which must be `tAxis`) overlaps the mortise thickness
band; pick max overlap. Then:

- `haunch_depth` default = governing `groove.depth`; explicit param wins.
- No governing groove → `HAUNCH_NO_GROOVE` warning (teach: a haunch usually fills a groove;
  carving anyway with the §3.4 default depth `t_a / 3`).
- Groove found but `|offset − mortise centre| > 1/64` or `|width − tenonThk| > 1/64` →
  `HAUNCH_GROOVE_MISMATCH` warning (the stub won't seat in the slot); geometry still carved.
- `sloped` + governing groove → `HAUNCH_GROOVE_MISMATCH` variant message: a sloped haunch
  tapers to zero and cannot fill a groove run-out.

**c. Width layout.** The haunch band **replaces** the haunch-side width shoulder (a haunched
corner runs to the rail's edge — a shoulder there would defeat it). With
`U = extent(R)[wAxis] − width_shoulders[otherSide]`:
`L = haunch_len ?? U/4` — the spec's "1/3 of tenon width" default solved against
`tenonW = U − L`: `L = tenonW/3 ⇒ L = U/4`. Main tenon spans the rest of `U`.

**Carve — b (tenon).** Cheek cutters unchanged (the stub is tenon-thickness). The haunch-side
shoulder cutter is replaced by the stub-forming cutter over the band
(`wAxis`: edge → edge∓L, `tAxis`: tenon band):

- square: box from `shoulderLine ± haunch_depth` (the stub tip) to the tenon end;
- sloped: frustum swept along `wAxis` — at the inner station the removal starts at the stub
  tip; at the board-edge station it starts at `shoulderLine` (stub depth → 0).

**Carve — a (mortise member).** The mortise pocket's haunch-side end now stops at the haunch
band (`R edge ∓ L`) instead of `∓ width_shoulders[side]`. A **haunch socket** cutter
(feature `'haunch'`) is **always emitted**: band × mortise thickness band × `haunch_depth`
into a from the entry face (square = box; sloped = mirror frustum). When the governing groove
matches, the socket is coplanar with the groove's channel and the boolean union makes it a
no-op — zero extra volume; when the groove is missing/mismatched it carves the socket a shop
would chop. One rule, no conditionals.

## 3. Wedged (`wedged`, `wedge_kerfs`)

Through joints only: `wedged && !through` → `WEDGE_NEEDS_THROUGH` warning, feature skipped.
Entry face = a's face on b's body side along `eAxis`; exit = opposite.

- **Mortise flare**: the box pocket becomes a frustum swept along `eAxis` — nominal
  width band at the entry station, +`FLARE = 1/8` per side at the exit station (§5.6),
  thickness band constant, clamped to a's bounds. Full-depth linear taper (documented
  simplification of the shop's half-depth flare). Feature stays `'mortise'`. Twin: each
  pocket flares independently; haunch: the flare's haunch-side spread at the exit eats into
  the socket band — physically what a spread tenon does.
- **Tenon kerfs**: `n = wedge_kerfs` box cutters (feature `'kerf'`), `KERF = 1/16` wide,
  normal along `wAxis` (the spread direction, toward the flared end walls), full tenon
  thickness, running from the tenon end to `1/2` short of the shoulder (§5.6). Kerf *i*
  centred at width fraction `(i+1)/(n+1)` across each tenon. Skipped (no warning) when the
  tenon is too short (`length ≤ 1/2`). Wedge stock itself is not board geometry — notes only.

## 4. Drawbore (`drawbore`, `pin_dia`, `drawbore_offset`)

No carve — same doctrine as butt fasteners (the pin fills its hole; subtracting then
re-filling would just churn the mesh). Three outputs:

- **Placement derivation**: pin axis along `tAxis` through a; `wAxis` at each mortise's
  centre (twin ⇒ one pin per tenon); `eAxis` at `entryFace ± setback` into a where
  `setback = 1.5 × pin_dia`. If `setback + pin_dia/2 > depth` the pin misses the tenon →
  `DRAWBORE_NO_ROOM` warning, pin skipped.
- **Machining notes** (`cutlist/notes.ts`): a `drill ⟨dia⟩ drawbore ×N`; b
  `drill ⟨dia⟩ drawbore, offset ⟨drawbore_offset⟩ toward shoulder ×N`.
- **Ghost pin**: new WASM-free module `eval/markers.ts` —
  `jointMarkers(model) → { jointId, kind: 'drawbore_pin', center, axis, dia, len }[]` in
  **world** space (pair-frame point → world via a's transform; pure math, no Manifold, so the
  server's 0-manifold-refs invariant is safe if it ever imports it). `len = t_a + 1/4`
  (reads as a pin, proud of both faces). The viewport renders translucent cylinders; the
  module is the designed seam for butt fastener ghosts (chunk 11 leftover) later.

## 5. Twin (`twin`)

Usable width `U` (after shoulders / haunch band) splits into **equal thirds**: tenons at the
outer thirds, gap in the middle (the shop rule: tenon ≈ gap ≈ ⅓). Derived, not parametric —
wide-rail twin sizing beyond thirds waits for a real need.

- **b**: cheeks unchanged (they span all tenons); one extra box cutter removes the middle
  third (feature `'shoulder'`, tenon-thickness band, full tenon length).
- **a**: two pockets (each flared when wedged; each drawbore-pinned when drawbore).
- The web between pockets (`U/3`) < 1/4 → `THIN_MORTISE_WALL` with a web-specific message.
- Haunch + twin: haunch band comes off first at the stile-end side, thirds split the rest.
- Notes: mortise/tenon dims use `U/3`; the ×2 comes from `dedupeCounts`.

## 6. Warnings added (`common.ts WarningCode`)

`HAUNCH_NO_GROOVE`, `HAUNCH_GROOVE_MISMATCH`, `WEDGE_NEEDS_THROUGH`, `DRAWBORE_NO_ROOM`.
All teaching-grade messages (§11.4 doctrine): what's wrong, why it matters, what to change.
The chunk-10 `JOINT_FEATURE_UNIMPLEMENTED` escapes for haunch/wedged/drawbore/twin are gone.

## 7. Files

**core** — `eval/types.ts` (`CutterFrustum`, `Cutter`, `'kerf'`), `eval/solids.ts`
(`buildFrustumCutter`, frustum overcut), `eval/evaluate.ts` (carve + key branches),
`eval/joints/util.ts` (`toLocalFrustum`), `eval/joints/mortiseTenon.ts` (the feature carves),
`eval/markers.ts` (new), `common.ts` (codes), `cutlist/notes.ts` (haunch/wedge/drawbore/twin
notes). **web** — `ui/JointParamsForm.tsx` (unhide the nine params), viewport ghost-pin
rendering. **tests** — property: analytic volumes for square/sloped haunch (trapezoid),
wedged flare + kerfs, twin; socket-coplanar-with-groove no-op; containment updated for
frustum bounds; golden: haunched / wedged / twin fixtures (kernel canary); notes + markers
unit tests; the chunk-10 "haunch is accepted but not carved" test inverts.

## 8. Explicitly out of scope

- Wedge/pin **stock** on the cut list (separate small parts — cut-list-engine follow-up).
- Butt fastener ghost cylinders (chunk 11 leftover; `markers.ts` is the seam).
- Fox-wedged (blind wedged) M&T; angled/compound tenons (§12 v1 exclusion holds).
- Parametric twin spacing; >2 tenons.
