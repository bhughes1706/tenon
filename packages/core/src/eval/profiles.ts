// Edge-profile cross-section curves (docs/chunk17-design.md §2). PURE — numbers in,
// polyline out, no WASM, no Board — the same solver/carve split as
// eval/joints/spacing.ts. buildProfileCutter (eval/solids.ts) sweeps this 2D curve
// along the arris; the sign/placement work lives there, so this file never needs to
// know which of the 8 arrises it is for.
//
// A curve is an OPEN polyline in ARRIS-FRAME (u, v): u points into the board along the
// edge's cross-grain normal (the direction edge_grooves' `depth` cuts), v points into
// the board along the face's thickness normal. The polyline traces the removed
// cross-section's boundary from the v = 0 face (`(reach, 0)`) to the u = 0 face
// (`(0, depth)`).
import type { EdgeProfile, ProfileSegment } from '../board.js'

// Fixed facet count per curved profile — NOT arc-length-adaptive, so carveKey stays
// stable and golden snapshots stay deterministic across machines. Roundover/cove spend
// all 16 on their single 90° arc; ogee splits 8 + 8 across its two half-radius arcs.
// Every curved profile is exactly PROFILE_FACETS + 1 points.
export const PROFILE_FACETS = 16

// Facets per `arc` segment of a `compound` profile — fixed (same determinism reasoning).
export const COMPOUND_ARC_FACETS = 8

// All arcs sampled as P(θ) = center + radius·(cos θ, sin θ) at evenly spaced θ, over
// [startDeg, endDeg] inclusive with `facets` segments (facets + 1 points).
function arc(
  center: [number, number],
  radius: number,
  startDeg: number,
  endDeg: number,
  facets: number,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= facets; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / facets
    const th = (deg * Math.PI) / 180
    pts.push([center[0] + radius * Math.cos(th), center[1] + radius * Math.sin(th)])
  }
  return pts
}

// Sample one arc segment from `prev` (exclusive) to `to` (inclusive), sweeping around
// `center` in `dir`. Radius is |prev − center|; the final point is forced exactly onto
// `to` so consecutive segments stay continuous even if the data's radius drifts slightly.
function arcSegment(
  prev: [number, number],
  center: [number, number],
  to: [number, number],
  dir: 'cw' | 'ccw',
  facets: number,
): [number, number][] {
  const r = Math.hypot(prev[0] - center[0], prev[1] - center[1])
  let a0 = Math.atan2(prev[1] - center[1], prev[0] - center[0])
  let a1 = Math.atan2(to[1] - center[1], to[0] - center[0])
  if (dir === 'ccw' && a1 <= a0) a1 += 2 * Math.PI
  if (dir === 'cw' && a1 >= a0) a1 -= 2 * Math.PI
  const out: [number, number][] = []
  for (let i = 1; i <= facets; i++) {
    if (i === facets) {
      out.push([to[0], to[1]])
      break
    }
    const a = a0 + ((a1 - a0) * i) / facets
    out.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)])
  }
  return out
}

// Walk a compound profile's segment path into a polyline (chunk 17.1). Lines add their
// endpoint; arcs add `COMPOUND_ARC_FACETS` sampled points. The result feeds the exact
// same sweep as every other profile — buildProfileCutter is polyline-generic.
function compoundCurve(start: [number, number], segments: ProfileSegment[]): [number, number][] {
  const pts: [number, number][] = [[...start]]
  let prev: [number, number] = start
  for (const seg of segments) {
    if (seg.kind === 'line') {
      pts.push([...seg.to])
    } else {
      pts.push(...arcSegment(prev, seg.center, seg.to, seg.dir, COMPOUND_ARC_FACETS))
    }
    prev = seg.to
  }
  return pts
}

export function profileCurve(p: EdgeProfile): [number, number][] {
  switch (p.profile) {
    // Straight cut — two points, no interior sampling.
    case 'chamfer':
      return [
        [p.width, 0],
        [0, p.width],
      ]
    // A step (not a taper) — three points. Distinct from the two-board `rabbet` JOINT
    // (chunk 10), which cuts a shoulder between two boards; this is a single-board edge.
    case 'rabbet':
      return [
        [p.width, 0],
        [p.width, p.depth],
        [0, p.depth],
      ]
    // Convex from the remaining-material side (rounds the corner off): arc from (r, 0)
    // to (0, r), center (r, r), θ 270° → 180°.
    case 'roundover':
      return arc([p.radius, p.radius], p.radius, 270, 180, PROFILE_FACETS)
    // Concave scoop, the mirror-image curvature of roundover: arc from (r, 0) to (0, r),
    // center (0, 0) (the arris itself), θ 0° → 90°.
    case 'cove':
      return arc([0, 0], p.radius, 0, 90, PROFILE_FACETS)
    // Roman ogee S-curve, two r/2 arcs sharing their midpoint (r/2, r/2). First arc
    // convex (center (r/2, 0), θ 0° → 90°), second concave (center (r/2, r), θ 270° →
    // 180°). Drop the second arc's first point — it duplicates the shared midpoint.
    case 'ogee': {
      const r = p.radius
      const first = arc([r / 2, 0], r / 2, 0, 90, PROFILE_FACETS / 2)
      const second = arc([r / 2, r], r / 2, 270, 180, PROFILE_FACETS / 2)
      return [...first, ...second.slice(1)]
    }
    // Arbitrary molding path (picture-frame, classical…) — swept verbatim.
    case 'compound':
      return compoundCurve(p.start, p.segments)
  }
}
