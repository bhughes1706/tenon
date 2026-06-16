// Shared box math for the JointFns (docs/chunk9-design.md §3). No WASM, no THREE —
// every cut in v1 is an axis-aligned prism (§6 step 3), so a JointFn is pure box
// geometry that returns CutterBox specs in each board's LOCAL frame. evaluate.ts
// turns those specs into Manifold prisms and carves.
//
// The recipe pattern every JointFn follows:
//   1. R = worldOverlap(a, b)            — the world-space box where a and b intersect.
//   2. Pick world axes from each board's OBB (length/width/thickness) and R's extents.
//   3. Build the cutter(s) as WORLD AABBs (overcutting the OPEN faces by OVERCUT so a
//      coplanar cut leaves no zero-thickness skin — gotcha #4).
//   4. toLocal() each world cutter into the target board's local frame.
// Because v1 boards are 90°-aligned, a world-axis box maps to a local-axis box exactly
// (worldBoxToLocal), so the carve runs board-local and the chunk 7/8 gizmo path is
// untouched (§5, gotcha #5).

import {
  overlapRegion,
  worldBoxToLocal,
  extent,
  center,
  type AABB,
  type Vec3,
} from '../../geometry/aabb.js'
import { WarningCode, type Warning } from '../../common.js'
import type { BoardSolid, CutterBox, CutFeatureKind } from '../types.js'

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

export const worldOverlap = (a: BoardSolid, b: BoardSolid): AABB | null => overlapRegion(a.aabb, b.aabb)

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

// World-space cutter AABB → target board's LOCAL frame, tagged with its CutFeature.
// 90°-exact (worldBoxToLocal); off-axis boards get a conservative box.
export function toLocal(s: BoardSolid, world: AABB, feature: CutFeatureKind): CutterBox {
  const loc = worldBoxToLocal(s.board, world)
  return { min: loc.min, max: loc.max, feature }
}

// A param the schema accepts but the carve doesn't realize yet (§5.6 M&T
// wedged/drawbore/twin/haunch, housing shoulder). The geometry renders without it; the
// warning teaches Claude/the UI it isn't structural so the param still round-trips.
export const unimplemented = (jointType: string, feature: string): Warning => ({
  code: WarningCode.JOINT_FEATURE_UNIMPLEMENTED,
  msg: `${jointType}: '${feature}' is accepted but not yet carved — the joint renders without it.`,
})
