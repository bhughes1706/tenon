// §5.8 dovetail (docs/chunk16-design.md §4–5). Same corner frame as the box joint, but
// the bands taper: tails (on b) flare toward the show face, pins (on a) narrow toward it.
// Every cut is a chunk-12 CutterFrustum swept along a's thickness (eAxis) — a trapezoid
// prism, constant along sAxis, tapering in wAxis, so its volume is analytic. a removes the
// N tail sockets; b removes the N−1 pin sockets + 2 edge half-pin notches. Tails + pins
// tile the corner cube at every station (§4 flare cancellation) → complement invariant.
//
// Depth doctrine (§5, mirrors M&T's blind cap): `lap` is minimum KEPT material on a; cut
// depth ℓ = min(engagement, t_a − lap_eff). Half-blind keeps the lap wall solid; through
// runs the sockets out both faces.
import type { JointFn, Cutter, BoardSolid } from '../types.js'
import type { Warning } from '../../common.js'
import { WarningCode } from '../../common.js'
import { CONTACT_TOL } from '../../geometry/preconditions.js'
import { frustumRectAxes } from '../types.js'
import { dovetailSpacing, type DovetailElement } from './spacing.js'
import {
  worldOverlap,
  toLocalFrustum,
  extent,
  center,
  lengthAxisW,
  widthAxisW,
  otherAxis,
  type Axis,
} from './util.js'

export const dovetail: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }

  // Corner frame (§1): eAxis = a's thickness (fingers run through it, flare develops over
  // the engagement); wAxis = shared width (joint runs along it); sAxis = a's length = t_b.
  const eAxis = lengthAxisW(b)
  const wAxis = widthAxisW(b)
  const sAxis = otherAxis(eAxis, wAxis)

  const W = extent(R)[wAxis]
  const tB = extent(R)[sAxis] // b's thickness overlap — the prism's constant sAxis extent
  const engagement = extent(R)[eAxis]
  const tA = extent(a.aabb)[eAxis]

  const slope = typeof params.slope === 'string' ? params.slope : '1:8'
  const variant = params.variant === 'half_blind' ? 'half_blind' : 'through'
  const pins = params.pins === 'auto' || typeof params.pins === 'number' ? params.pins : 'auto'
  const halfPinWidth = typeof params.half_pin_width === 'number' ? params.half_pin_width : undefined

  const warnings: Warning[] = []

  // ── Depth doctrine (§5) ────────────────────────────────────────────────────────
  const lapEff =
    variant === 'half_blind' ? (typeof params.lap === 'number' ? params.lap : tA / 4) : 0
  let ell = Math.min(engagement, tA - lapEff)
  if (variant === 'half_blind' && engagement > tA - lapEff + CONTACT_TOL) {
    warnings.push({
      code: WarningCode.DOVETAIL_LAP_CAPPED,
      msg: `${b.board.name} reaches within ${fmt(tA - engagement)} of ${a.board.name}'s face — the ${fmt(lapEff)} lap caps the sockets at ${fmt(ell)}. Pull ${b.board.name} back ${fmt(engagement - (tA - lapEff))} to seat, or reduce lap.`,
    })
  }
  if (variant === 'through' && engagement < tA - CONTACT_TOL) {
    ell = engagement
    warnings.push({
      code: WarningCode.DOVETAIL_NOT_THROUGH,
      msg: `Tails stop ${fmt(tA - engagement)} short of showing — slide ${b.board.name} flush or use half_blind.`,
    })
  }

  const lay = dovetailSpacing({ W, tB, ell, slope, pins, halfPinWidth })
  warnings.push(...lay.warnings)

  // Degenerate: the flare swallowed the tail (slope too steep for this depth/count). Reject
  // the carve — a lenient carve here would emit self-intersecting geometry (§4).
  if (lay.degenerate) {
    warnings.push({
      code: WarningCode.JOINT_PRECONDITION_FAILED,
      msg: `A ${slope} slope over ${fmt(ell)} of depth flares more than the ${fmt(lay.meanTail)} tail — the tails collapse. Use a shallower slope, fewer tails, or less depth.`,
    })
    return { a: [], b: [], warnings }
  }

  // ── Frustum geometry (§5) ───────────────────────────────────────────────────────
  // Sweep along eAxis from the entry face (baseline, on b's body side) inward by ℓ. The
  // wAxis cross-section tapers base → tip; sAxis is the full t_b overlap (constant).
  const bBodyHigh = center(b.aabb)[eAxis] >= center(a.aabb)[eAxis]
  const entryFace = bBodyHigh ? a.aabb.max[eAxis] : a.aabb.min[eAxis]
  const far = bBodyHigh ? entryFace - ell : entryFace + ell
  const span: [number, number] = [Math.min(entryFace, far), Math.max(entryFace, far)]
  const baselineAtHi = bBodyHigh // baseline (entry) is at span[1] when b's body is high
  const sFull: [number, number] = [R.min[sAxis], R.max[sAxis]]

  // Frustum rect for a station's wAxis band: coords are the two non-sweep axes ASCENDING.
  const rectFor = (band: [number, number]) => {
    const [u, v] = frustumRectAxes(eAxis)
    const ranges: Record<number, [number, number]> = { [sAxis]: sFull, [wAxis]: band }
    return {
      min: [ranges[u][0], ranges[v][0]] as [number, number],
      max: [ranges[u][1], ranges[v][1]] as [number, number],
    }
  }

  const socket = (tgt: BoardSolid, el: DovetailElement, feature: 'tail_socket' | 'pin_socket') => {
    const base: [number, number] = [R.min[wAxis] + el.base[0], R.min[wAxis] + el.base[1]]
    const tip: [number, number] = [R.min[wAxis] + el.tip[0], R.min[wAxis] + el.tip[1]]
    if (base[1] - base[0] <= 1e-9 && tip[1] - tip[0] <= 1e-9) return null
    const baseRect = rectFor(base)
    const tipRect = rectFor(tip)
    return toLocalFrustum(
      tgt,
      {
        axis: eAxis as Axis,
        span,
        rectLo: baselineAtHi ? tipRect : baseRect, // rectLo is at span[0]
        rectHi: baselineAtHi ? baseRect : tipRect,
      },
      feature,
    )
  }

  const aCut: Cutter[] = []
  const bCut: Cutter[] = []
  for (const el of lay.elements) {
    if (el.kind === 'tail') {
      const c = socket(a, el, 'tail_socket') // a (pin board) loses the tail sockets
      if (c) aCut.push(c)
    } else {
      const c = socket(b, el, 'pin_socket') // b (tail board) loses pins + edge half-pins
      if (c) bCut.push(c)
    }
  }

  return { a: aCut, b: bCut, warnings }
}

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`
