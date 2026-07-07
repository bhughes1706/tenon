// Shared box math for the JointFns (docs/chunk9-design.md §3). No WASM, no THREE —
// every cut is an axis-aligned prism IN THE PAIR FRAME (§6 step 3), so a JointFn is
// pure box geometry that returns CutterBox specs in each board's LOCAL frame.
// evaluate.ts turns those specs into Manifold prisms and carves.
//
// The recipe pattern every JointFn follows:
//   1. R = worldOverlap(a, b)            — the box where a and b intersect (pair frame).
//   2. Pick axes from each board's OBB (length/width/thickness) and R's extents.
//   3. Build the cutter(s) as pair-frame AABBs (overcutting the OPEN faces by OVERCUT
//      so a coplanar cut leaves no zero-thickness skin — gotcha #4).
//   4. toLocal() each cutter into the target board's local frame.
//
// The PAIR FRAME is board a's own local frame (pairSolids below). Every quantity a
// recipe reads — a.aabb, b.aabb, the OBB axes, the overlap R — is expressed in it, so
// the identical box math that was exact for world-aligned boards is now exact whenever
// the two boards are square TO EACH OTHER, at any assembly orientation (§Angle
// readiness). The names kept their "world" flavor (worldOverlap, lengthAxisW) because
// the recipes' logic is unchanged; "W" now reads "in the pair frame".

import {
  applyMat3,
  eulerXYZToMat3,
  matMul,
  overlapRegion,
  reframeBox,
  pairFrame,
  transpose,
  extent,
  center,
  type AABB,
  type Vec3,
} from '../../geometry/aabb.js'
import type { Board } from '../../board.js'
import { WarningCode, type Warning } from '../../common.js'
import type { BoardSolid, CutterBox, CutterFrustum, CutFeatureKind } from '../types.js'
import { frustumCorners, frustumRectAxes } from '../types.js'

export { extent, center }
export type { AABB, Vec3 }

export type Axis = 0 | 1 | 2

// Per-axis [lo, hi] spans of a world box, indexable by Axis. The recipes start from
// the overlap region and override one axis at a time.
export type Spans = [[number, number], [number, number], [number, number]]

export const minAxis = (v: Vec3): Axis => (v[0] <= v[1] && v[0] <= v[2] ? 0 : v[1] <= v[2] ? 1 : 2)
export const maxAxis = (v: Vec3): Axis => (v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[2] ? 1 : 2)

// World axis a vector points along most strongly (the OBB axes are ±world-unit for
// 90° boards, so this recovers which world axis a board's local x/y/z maps to).
export const dominantAxis = (v: Vec3): Axis => maxAxis([Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])])

// A board's local length/width/thickness expressed as a WORLD axis index.
export const lengthAxisW = (s: BoardSolid): Axis => dominantAxis(s.obb.axes[0])
export const widthAxisW = (s: BoardSolid): Axis => dominantAxis(s.obb.axes[1])
export const thickAxisW = (s: BoardSolid): Axis => dominantAxis(s.obb.axes[2])

// The remaining axis given two distinct ones (0+1+2 = 3).
export const otherAxis = (i: Axis, j: Axis): Axis => (3 - i - j) as Axis

// NOTE: requireContact() in geometry/preconditions.ts treats a gap ≤ CONTACT_TOL (1/64")
// as touching so grid-snapping float gaps don't reject a valid joint. This call is the
// strict overlapRegion (null on any gap), so a joint that cleared the precondition via
// the 1/64" grace returns no cutters here — silent, but the gap is sub-visual.
export const worldOverlap = (a: BoardSolid, b: BoardSolid): AABB | null => overlapRegion(a.aabb, b.aabb)

// Build the two BoardSolids a JointFn consumes, expressed in the PAIR frame (board a's
// local frame). a's box is its exact local box (identity axes); b's is reframed into
// a's frame via pairFrame() — exact iff `aligned`. Callers (evaluate.ts) must gate on
// the joint precondition, which rejects non-aligned pairs, before carving from these.
export function pairSolids(a: Board, b: Board): { a: BoardSolid; b: BoardSolid; aligned: boolean } {
  const pf = pairFrame(a, b)
  const frame = { pos: a.transform.pos, rot: eulerXYZToMat3(...a.transform.rot) }
  return {
    a: {
      board: a,
      aabb: pf.aBox,
      obb: {
        center: [0, 0, 0],
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        halfExtents: [a.dims.l / 2, a.dims.w / 2, a.dims.t / 2],
      },
      frame,
    },
    b: {
      board: b,
      aabb: pf.bBox,
      obb: {
        center: center(pf.bBox),
        axes: pf.bAxes,
        halfExtents: [b.dims.l / 2, b.dims.w / 2, b.dims.t / 2],
      },
      frame,
    },
    aligned: pf.aligned,
  }
}

// Round to the nearest tool increment (1/8" bridle, 1/16" M&T) — snap_to_tool.
export const snap = (v: number, step: number): number => Math.round(v / step) * step

// Per-axis spans seeded from the overlap region; recipes mutate individual axes.
export const fromR = (R: AABB): Spans => [
  [R.min[0], R.max[0]],
  [R.min[1], R.max[1]],
  [R.min[2], R.max[2]],
]

export const spanBox = (s: Spans): AABB => ({
  min: [s[0][0], s[1][0], s[2][0]],
  max: [s[0][1], s[1][1], s[2][1]],
})

// Pair-frame cutter AABB → target board's LOCAL frame, tagged with its CutFeature.
// EXACT for mutually-square pairs (the reframe rotation is then a signed permutation).
// For board a this is the identity (the pair frame IS a's local frame).
export function toLocal(s: BoardSolid, box: AABB, feature: CutFeatureKind): CutterBox {
  const loc = reframeBox(box, s.frame.pos, s.frame.rot, s.board.transform.pos, eulerXYZToMat3(...s.board.transform.rot))
  return { min: loc.min, max: loc.max, feature }
}

// Pair-frame frustum cutter → target board's LOCAL frame (docs/chunk12-design.md §1).
// Same transform as toLocal — a signed permutation for mutually-square pairs — applied to
// the 8 corners and rebuilt: regrouping by station handles axis remaps, station flips, and
// rect min/max swaps without case analysis. For board a it is the identity (pair frame IS
// a's local frame).
export function toLocalFrustum(
  s: BoardSolid,
  f: Omit<CutterFrustum, 'frustum' | 'feature'>,
  feature: CutFeatureKind,
): CutterFrustum {
  const full: CutterFrustum = { frustum: true, feature, ...f }
  const targetRot = eulerXYZToMat3(...s.board.transform.rot)
  const compose = matMul(transpose(targetRot), s.frame.rot)
  const offset = applyMat3(transpose(targetRot), [
    s.frame.pos[0] - s.board.transform.pos[0],
    s.frame.pos[1] - s.board.transform.pos[1],
    s.frame.pos[2] - s.board.transform.pos[2],
  ])
  const map = (p: Vec3): Vec3 => {
    const r = applyMat3(compose, p)
    return [r[0] + offset[0], r[1] + offset[1], r[2] + offset[2]]
  }
  // Corners come out 4-per-station in order (lo group first — see frustumCorners).
  const corners = frustumCorners(full).map(map)
  // New sweep axis = image of the old one under the (signed-permutation) rotation.
  const unit: Vec3 = [0, 0, 0]
  unit[f.axis] = 1
  const newAxis = dominantAxis(applyMat3(compose, unit))
  const [u, v] = frustumRectAxes(newAxis)
  const rectOf = (group: Vec3[]) => ({
    min: [Math.min(...group.map((p) => p[u])), Math.min(...group.map((p) => p[v]))] as [number, number],
    max: [Math.max(...group.map((p) => p[u])), Math.max(...group.map((p) => p[v]))] as [number, number],
  })
  const groupA = corners.slice(0, 4)
  const groupB = corners.slice(4)
  const sA = groupA[0][newAxis]
  const sB = groupB[0][newAxis]
  const [loGroup, hiGroup, lo, hi] = sA <= sB ? [groupA, groupB, sA, sB] : [groupB, groupA, sB, sA]
  return {
    frustum: true,
    axis: newAxis,
    span: [lo, hi],
    rectLo: rectOf(loGroup),
    rectHi: rectOf(hiGroup),
    feature,
  }
}

// A param the schema accepts but the carve doesn't realize yet (§5.6 M&T
// wedged/drawbore/twin/haunch, housing shoulder). The geometry renders without it; the
// warning teaches Claude/the UI it isn't structural so the param still round-trips.
export const unimplemented = (jointType: string, feature: string): Warning => ({
  code: WarningCode.JOINT_FEATURE_UNIMPLEMENTED,
  msg: `${jointType}: '${feature}' is accepted but not yet carved — the joint renders without it.`,
})
