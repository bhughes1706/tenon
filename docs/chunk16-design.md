# Chunk 16 — Box joint + dovetail spacing solvers (design + derivation)

**Status:** DERIVED (Fable 5 math session 2026-07-06) — not yet implemented. Hand to
Opus 4.8 with this doc as ground truth. The two derivation problems the §15 table calls
out are solved in §2 (box) and §4 (dovetail); §3/§5 are the carve recipes they feed.

**Reordering note (2026-07-07):** originally spec §15 row 18 (after the bid engine).
Moved up to row 16 — box/dovetail carving is more valuable near-term than the bid
engine and has no dependency on it (only on chunk 10, already done). See
`AGENT_HANDOFF.md` and spec §15 for the renumbered chunk table.

Spec authority: §5.7 (box_joint), §5.8 (dovetail), §6.1 (invariants). Schemas exist since
chunk 2 (`BoxJointParamsSchema`, `DovetailParamsSchema` in `joint.ts`) — no schema changes.
**No new cutter primitives**: box joint is `CutterBox` only; every dovetail cut is a
chunk-12 `CutterFrustum` (a trapezoid prism IS a linear sweep between two axis-aligned
rects with only one rect dimension varying — analytic volume `|span| × (A_lo + A_hi)/2`
is exact). That is the big de-risk of this chunk.

All lengths in inches, as everywhere in `core`.

---

## 1. Corner frame + preconditions (shared by both joints)

Both joints join two board **ends** at a corner. In the pair frame (= a's local frame,
`pairSolids`), the valid configuration is:

- **`eAxis` = 2** (a's thickness): b's length runs along it — b penetrates a through
  a's thickness. Require `dominantAxis(bAxes[0]) === 2`.
- **`wAxis` = 1** (a's width): the joint width. Require `dominantAxis(bAxes[1]) === 1`
  (widths parallel). `W = extent(R)[wAxis]` — the actual overlap, so unequal-width
  boards (inset drawer side) just get a joint over the shared width. Lenient, no reject.
- **`sAxis` = 0** (a's length = b's thickness): the assembly/slide direction.

`R = worldOverlap(a, b)` is then the corner cube: `extent(R) = [t_b-ish, W, ℓ]` with
engagement `ℓ ≤ t_a`. Roles follow the M&T convention — **a receives** (pin/socket
board; the drawer front for dovetails, carries the half-blind lap), **b inserts**
(finger/tail board).

**Assembly direction is `sAxis`, derived, and it fixes the open faces.** Sliding along
`eAxis` is geometrically blocked at every partial depth: at insertion depth `d`, the tail
width at distance `s` from the tip must clear the socket width at station `d − s`, which
reduces to `d ≥ ℓ` — possible only at full seat. (That is the joint's whole point: it
locks along `eAxis`.) Both variants assemble by sliding b along `sAxis` onto a's end.
Consequences for overcut (gotcha #4):

| Cutter | `sAxis` | `wAxis` | `eAxis` |
|---|---|---|---|
| on **a** (sockets) | floor at `R.min/max` interior side **solid**; a's end face **open** | per layout | through: **both open**; half-blind: entry open, lap wall **solid** |
| on **b** (notches) | **both open** (full t_b) | per layout | baseline shoulder **solid**; b's end face **open** |

`preconditions.ts` (replacing the chunk-10 lenient default for these two types):
1. `dominantAxis(bAxes[0]) !== 2` → reject: "⟨b⟩ meets ⟨a⟩ along its length — a
   box joint/dovetail joins two board ends at a corner. Bring ⟨b⟩'s end into ⟨a⟩'s
   thickness." (name boards + measured config, §11.4 doctrine).
2. `dominantAxis(bAxes[1]) !== 1` → reject: widths not parallel.
3. Box joint only: run the §2 solver; `w_end ≤ 0` → reject with the numbers
   ("pin width ⟨p⟩ needs ≥ ⟨3p − …⟩ of joint width; this joint is ⟨W⟩ wide —
   reduce pin_width or widen the boards").

Solvers are **pure functions in `eval/joints/spacing.ts`** (per §5.8: "pure functions,
unit-testable without UI") — no WASM, no Board, just numbers in / layout out. The
JointFns consume their output.

## 2. Box joint spacing solver (§5.7)

Inputs: `W`, `t_thin = min(t_a, t_b)` (from R extents), params `{ pin_width?, start }`.

- **Pin width**: `p = pin_width ?? clamp(snap(t_thin, 1/8), 1/4, 3/4)` — the spec's
  "default t of thinner board, snapped 1/4–3/4" read as: snap to the 1/8 dado/router
  family, clamp into [1/4, 3/4]. An explicit `pin_width` is used verbatim (matches M&T:
  overrides win; the snap language attaches to the default).
- **Finger count**: `n` = the **odd** integer ≥ 3 minimizing `|W − n·p|`; tie → smaller
  `n`. Odd ⇒ the joint is symmetric (a's `start`-type finger at both ends), so the
  layout is orientation-independent. Minimizing `|W − n·p|` is exactly minimizing the
  end-finger deviation from `p` (see below); the tie rule prefers wider end fingers over
  narrower — a shop would too.
- **Remainder to the end fingers** (spec text verbatim): with `r = W − n·p`, interior
  fingers are exactly `p` and both end fingers are `w_end = p + r/2`. Station bounds
  along `wAxis` from `R.min[wAxis]`: `[0, w_end, w_end + p, …, W]` (n+1 stations).
- **Warnings**: `w_end < p/2` → `BOX_THIN_END_PIN` ("end fingers are ⟨w_end⟩ — less
  than half the ⟨p⟩ pin width. They'll look like an afterthought and chip easily; try
  pin_width ⟨W/n′⟩ or a different board width."). Unclamped `n ≥ 3` never produces this
  (nearest-odd keeps `|r| ≤ p` ⇒ `w_end ≥ p/2`); it fires when the `n = 3` clamp binds
  or `pin_width` was overridden too large — exactly the cases worth teaching.
- `start: 'pin' | 'socket'`: finger index 0 (at `R.min[wAxis]`) on **a** is kept
  material (`'pin'`) or removed (`'socket'`). Even indices are a's `start` type; b is
  the complement.

Output: `{ n, p, wEnd, stations: number[], warnings }`.

**Worked fixtures** (unit tests):
- `W = 4, t_thin = 1/2` → `p = 1/2`, candidates n = 7 (|4 − 3.5| = 0.5) vs 9 (0.5),
  tie → **7**; `w_end = 3/4`. Widths `[3/4, 1/2 ×5, 3/4]`, sum 4 ✓, no warning.
- `W = 1.25, pin_width = 3/4` → nearest odd is 1, clamp → **3**; `r = −1`,
  `w_end = 1/4 < 3/8` → `BOX_THIN_END_PIN`.
- `W = 2.24, t_thin = 0.8` → `p = clamp(snap(0.8, 1/8), …) = 3/4`, n = 3,
  `w_end = 3/4 − 0.005` — sub-1/64 remainder case, no warning.

## 3. Box joint carve

All cutters are boxes spanning the full corner cube in `sAxis` and `eAxis` (open faces
per the §1 table), banded along `wAxis` by the solver stations. a removes its
non-`start`-parity bands; b removes the complement. Feature kind: **`'finger'`** on both
boards (new `CutFeatureKind`, additive — nothing in web switches on kinds).

The bands partition R ⇒ **complement invariant**: `vol_removed_a + vol_removed_b =
vol(R)` exactly (§6.1 complement test, previously half-lap-only, now three joints).

Flushness lint (through joint by definition): `t_a − extent(R)[eAxis] > CONTACT_TOL` or
`t_b − extent(R)[sAxis] > CONTACT_TOL` → `BOX_NOT_THROUGH` warning, carve proceeds with
actual R ("⟨b⟩'s end sits ⟨gap⟩ short of ⟨a⟩'s outer face — box fingers should run
through. Slide ⟨b⟩ flush.").

## 4. Dovetail spacing solver (§5.8)

Inputs: `W`, `t_b` (= `extent(R)[sAxis]`), cut depth `ℓ` (§5), flare `f`, params
`{ slope, pins, half_pin_width, variant, lap }`.

**Slope → flare.** `slope: "rise:run"` (validated by the schema regex): a tail spreads
`rise/run` per unit of engagement, so the **full-length per-side flare** is
`f = ℓ · rise/run` (1:8, ℓ = 3/4 → `f = 3/32`). No tool snapping anywhere in this
solver — dovetails are sawn to a line, not to a cutter.

**Measurement convention — mid-depth.** All solver widths are at the mid-engagement
station (ȳ = ℓ/2). Three reasons: (1) the sum `2h̄ + N·T̄ + (N−1)·P̄ = W` then holds at
*every* station, because per-station flares cancel — tails gain `2f`, the `N−1` pins
lose `2f`, the two half-pins lose `f`: `2Nf − 2(N−1)f − 2f = 0`; (2) trapezoid-prism
volume is exactly `t_b · ℓ · (mean width)`, so analytic test volumes read straight off
the solver; (3) the 2:1 look is exact in area, which is what the eye reads. Conversions:
tails `T_base = T̄ − f`, `T_tip = T̄ + f`; pins `P_base = P̄ + f`, `P_tip = P̄ − f`
(pins are narrowest at the tip/show face — correct: that's the fine-pin end-grain view);
half-pins `h̄ ± f/2`.

**Layout.** `[half-pin h̄ | tail T̄ | pin P̄ | … | tail T̄ | half-pin h̄]` — N tails,
N−1 full pins, half-pins at both edges. Always symmetric.

**The algebra.** The spec pins the *proportions*: `pins: "auto"` targets `T ≈ 2P`, and
`half_pin_width` defaults to `T/2 = P`. Substituting into the width sum:

- default `h̄ = P̄`:  `W = P̄(3N + 1)`  ⇒  **`P̄ = W / (3N + 1)`**, `T̄ = 2P̄`
- explicit `h̄`:   `W − 2h̄ = P̄(3N − 1)`  ⇒  `P̄ = (W − 2h̄) / (3N − 1)`, `T̄ = 2P̄`

**Tail count** — the ratio holds for *any* N, so the count needs an absolute anchor.
**Design decision (spec is silent — the one number to veto): target `T̄* = 2·t_b`**, the
classic hand-cut proportion (tails ≈ twice stock thickness ⇒ pins ≈ stock thickness).
With the default h̄ that gives

`N = max(1, round((W / t_b − 1) / 3))`

(explicit h̄: `N = max(1, round(((W − 2h̄)/t_b + 1) / 3))`). Numeric `pins` param = the
**full-pin count** (the schema's name is authoritative): `N = pins + 1`; the schema's
positive-int floor means a single-tail joint only arises via `"auto"`.

Output: `{ tails: N, meanPin, meanTail, meanHalfPin, f, elements }` where `elements` is
the ordered list `{ kind: 'half_pin' | 'tail' | 'pin', base: [lo, hi], tip: [lo, hi] }`
along `wAxis` from `R.min[wAxis]` — directly consumable as frustum rects.

**Warnings** (carve proceeds — lenient doctrine):
- narrowest station of any pin (`P_tip`) or half-pin (`h_tip = h̄ − f/2`) `< 1/4` →
  `DOVETAIL_THIN_PIN` ("narrowest pin is ⟨x⟩ — under 1/4 there's no chisel to chop it
  and the short grain is fragile; fewer tails or shallower slope").
- `T_base ≤ 0` (flare exceeds the tail) → reject in the JointFn (degenerate; teach:
  slope too steep for this depth/count).

**Worked fixtures:**
- Case side: `W = 12, t_a = t_b = 3/4`, through, 1:8. `ℓ = 3/4`, `f = 3/32`.
  `N = round((16 − 1)/3) = 5`; `P̄ = 12/16 = 3/4`, `T̄ = 1.5`, `h̄ = 3/4`.
  `T_base = 1.40625`, `T_tip = 1.59375`, `P_tip = 21/32 ≈ 0.656` ✓ no warning.
  Analytic: a removes `5 × 1.5 × (3/4)² = 4.21875 in³`, b removes
  `(2·3/4 + 4·3/4) × 1.5 × … ` — a + b `= W·ℓ·t_b = 6.75 in³` ✓.
- Drawer: `W = 3, t_a = 3/4, t_b = 1/2`, half_blind, lap default `t_a/4 = 3/16` ⇒
  `ℓ = 9/16`, `f = 9/128`. `N = round((6 − 1)/3) = 2`; `P̄ = 3/7`, `T̄ = 6/7`,
  `P_tip ≈ 0.358` ✓.
- Thin-stock warning: `W = 8, t_b = 3/8`, 1:6, `t_a = 3/8` → N = 7, `P̄ = 8/22 ≈ 0.364`,
  `f = 1/16`, `P_tip ≈ 0.30`… drop `t_b` to `5/16` to trip `DOVETAIL_THIN_PIN` (fixture
  should pin the exact numbers at implementation).

## 5. Dovetail carve (through + half-blind)

**Depth doctrine** (mirrors M&T's blind cap): `lap` is **minimum kept material** on a;
cut depth `ℓ = min(engagement, t_a − lap_eff)` where `lap_eff = variant === 'half_blind'
? (lap ?? t_a/4) : 0`.
- half-blind with `engagement > t_a − lap` → depth capped + `DOVETAIL_LAP_CAPPED`
  ("⟨b⟩ reaches within ⟨x⟩ of ⟨a⟩'s face — the ⟨lap⟩ lap caps the sockets at ⟨ℓ⟩.
  Pull ⟨b⟩ back ⟨d⟩ to seat, or reduce lap."). The uncapped remainder of b inside a's
  lap will also trip the evaluator's collision lint — the specific warning teaches the fix.
- through with `engagement < t_a − CONTACT_TOL` → `DOVETAIL_NOT_THROUGH`, carve at
  actual `ℓ` ("tails stop ⟨gap⟩ short of showing — slide ⟨b⟩ flush or use half_blind").

Every cutter is a `CutterFrustum`, **sweep axis `eAxis`**, `span = [baseline, baseline + ℓ]`
where baseline = the R face nearer b's body. Rect axes for axis 2 are `[0, 1]`
(`frustumRectAxes`): dim 0 (`sAxis`) is constant, dim 1 (`wAxis`) carries the taper —
the "only one rect dimension varies" case, so volumes stay analytic.

- **a — tail sockets** (feature `'tail_socket'`): N frusta. `wAxis` rect bounds =
  element `base` at the baseline station and `tip` at the far station. `sAxis`: full R,
  a's-end face open, interior floor solid. `eAxis`: through → both stations overcut;
  half-blind → entry overcut, lap wall exact.
- **b — pin sockets** (feature `'pin_socket'`): N−1 interior frusta (pin bounds:
  **wide at baseline**, narrow at tip) + 2 edge notches (from the R edge, width `h(y)`).
  `sAxis`: full t_b, both faces open. `eAxis`: baseline shoulder solid, b's end open.

Tails + pins partition R at every station (§4 cancellation) ⇒ the same **complement
invariant** as the box joint: `vol_a + vol_b = W·ℓ·t_b` exactly. Per-cutter analytic
volume: `t_b · ℓ · (mean width)`.

Half-blind is the **same recipe** with `ℓ` shortened and one overcut rule flipped — the
lap is simply the slab of a beyond R that no cutter touches. The socket stays open on
a's end face (`sAxis`), which is both physically right (the classic end-grain view of a
half-blind drawer front) and required by the §1 assembly derivation.

## 6. Warnings added (`common.ts WarningCode`)

`BOX_THIN_END_PIN`, `BOX_NOT_THROUGH`, `DOVETAIL_THIN_PIN`, `DOVETAIL_NOT_THROUGH`,
`DOVETAIL_LAP_CAPPED`. All teaching-grade (§11.4): the measured value, the threshold,
the fix. The joints/index.ts `JOINT_FEATURE_UNIMPLEMENTED` escapes for box_joint /
dovetail are removed (miter's remains).

## 7. Files

**core** — `eval/joints/spacing.ts` (new: both pure solvers), `eval/joints/boxJoint.ts`,
`eval/joints/dovetail.ts` (new JointFns), `eval/joints/index.ts` (register),
`geometry/preconditions.ts` (§1 corner checks + box reject), `eval/types.ts`
(`'finger' | 'tail_socket' | 'pin_socket'`), `common.ts` (codes), `cutlist/notes.ts`
(replace stubs: a/b `box joint ⟨n⟩ fingers × ⟨p⟩`; a `dovetail sockets: ⟨N⟩ tails 1:8,
half-blind lap ⟨lap⟩`; b `dovetail tails: ⟨N⟩ @ ⟨T̄⟩`). **web** —
`ui/JointParamsForm.tsx` (unhide params), `lib/jointTypes.ts` labels if new kinds
surface in face-pick. **tests** — `spacing.test.ts` pure unit tests (§2/§4 fixtures
verbatim); property: partition/complement, analytic mean-width volumes, containment,
idempotence, Manifold validity for both joints × both variants; golden fixtures (box
corner, through dovetail case, half-blind drawer) as kernel canaries; notes unit tests;
the chunk-10 "deferred joint warns UNIMPLEMENTED" test inverts for these two types.

## 8. Explicitly out of scope

- Miter (§5.9, v1.5) — its `JOINT_FEATURE_UNIMPLEMENTED` path stays.
- Sliding dovetail (a housing variant, not this corner joint), rabbeted half-blind,
  mitered-shoulder dovetails, hound's-tooth / variable ("London pattern") spacing.
- Compound-angle corners (§ Angle readiness reject holds — square-to-each-other only).
- Blind/half-blind **box** joints; box-joint depth params (through by definition).
- Assembly-motion validation beyond the §1 open-face derivation (no kinematics).
