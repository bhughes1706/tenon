// Joint geometric preconditions (§4.2 step 3, §5 "Requires" rows). One predicate
// per joint type: does the spatial relationship of a and b actually support this
// joint? Reasons must TEACH (§11.4) — name the boards, the measured value, and the
// threshold — because Claude/the UI act on the rejection text.
//
// Pure analytic core, computed in the PAIR frame (board a's local frame, pairFrame()).
// EXACT whenever the two boards are square TO EACH OTHER (relative rotation a signed
// permutation) — the assembly's world orientation is irrelevant, so a whole piece can
// sit at any angle. A genuinely compound-angle pair (not square to each other) is
// rejected outright: the carve recipes can't produce correct geometry for it yet, and
// a clear "not supported" beats silently wrong joinery (§Angle readiness).

import type { Board } from '../board.js'
import type { JointType } from '../joint.js'
import { pairFrame, overlapRegion, extent, type PairFrame, type AABB, type Vec3 } from './aabb.js'

export interface PrecondResult {
  ok: boolean
  reason?: string
}

const OK: PrecondResult = { ok: true }

// Tunables (docs/chunk9-design.md §10).
export const CONTACT_TOL = 1 / 64 // in — flush-contact / through derivation tolerance
export const MT_MIN_ENGAGEMENT = 0.5 // in — §5.6 mortise_tenon "requires"

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`

// Names of board a's local axes, for teaching messages (the pair frame IS a's frame).
const A_AXIS_NAME = ['length', 'width', 'thickness'] as const

// Index of the axis a direction vector points along most strongly.
const dominantAxis = (v: Vec3): 0 | 1 | 2 => {
  const m = v.map(Math.abs)
  return (m[0] >= m[1] && m[0] >= m[2] ? 0 : m[1] >= m[2] ? 1 : 2) as 0 | 1 | 2
}

// Common gate: a and b must actually touch/overlap, measured in the pair frame.
// Returns the overlap box, or a teaching failure naming the gap. A gap ≤ CONTACT_TOL
// (1/64") is treated as touching — grid snapping can leave sub-1/64" float gaps
// between faces that are nominally flush.
function requireContact(a: Board, b: Board, frame: PairFrame): { region: AABB } | { fail: PrecondResult } {
  const region = overlapRegion(frame.aBox, frame.bBox)
  if (region) return { region }
  // Compute per-axis gap; find the widest separation for the error message, and
  // determine whether every axis is within CONTACT_TOL (near-contact counts as touching).
  let maxGap = 0
  let reportAxis: 0 | 1 | 2 = 0
  const rMin: Vec3 = [0, 0, 0]
  const rMax: Vec3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(frame.aBox.min[i], frame.bBox.min[i])
    const hi = Math.min(frame.aBox.max[i], frame.bBox.max[i])
    rMin[i] = lo
    rMax[i] = hi
    const sep = lo - hi // positive when there is a gap on this axis
    if (sep > maxGap) {
      maxGap = sep
      reportAxis = i as 0 | 1 | 2
    }
  }
  if (maxGap <= CONTACT_TOL) {
    // Near-contact: clamp to a zero-or-positive-extent degenerate region.
    return { region: { min: rMin, max: [Math.max(rMin[0], rMax[0]), Math.max(rMin[1], rMax[1]), Math.max(rMin[2], rMax[2])] } }
  }
  return {
    fail: {
      ok: false,
      reason: `${a.name} and ${b.name} do not touch — a gap of ${fmt(maxGap)} along ${a.name}'s ${A_AXIS_NAME[reportAxis]}. Move them into contact before adding this joint.`,
    },
  }
}

export function checkJointPrecondition(
  type: JointType,
  a: Board,
  b: Board,
  params: Record<string, unknown> = {},
): PrecondResult {
  const frame = pairFrame(a, b)
  // The carve recipes are exact only for boards square to each other. Compound-angle
  // pairs are rejected with a teaching reason rather than carved wrong — this replaces
  // the old world-axis-aligned requirement, so a whole assembly may be rotated freely.
  if (!frame.aligned) {
    return {
      ok: false,
      reason: `${a.name} and ${b.name} are not square to each other (compound angle) — joints currently require the two boards' faces to be parallel or perpendicular. Rotate one to a 90° multiple relative to the other.`,
    }
  }
  const gate = requireContact(a, b, frame)
  if ('fail' in gate) return gate.fail
  const region = gate.region
  const ext = extent(region)

  switch (type) {
    case 'butt':
    case 'rabbet':
    case 'bridle':
      // First-wave lenient: genuine contact is the only hard requirement; the
      // carve recipe handles the rest. (Refined per-type checks can tighten later.)
      return OK

    case 'half_lap': {
      // Necessary (not sufficient): boards must have positive overlap in at least 2
      // dimensions. A face-stacked pair (overlap in l & w, thin in t) passes here —
      // the carve recipe is what distinguishes a true crossing from a stack.
      const crossing = ext.filter((e) => e > CONTACT_TOL).length
      if (crossing < 2) {
        return {
          ok: false,
          reason: `${a.name} and ${b.name} do not cross — a half-lap needs overlap in both plan dimensions (overlap is ${fmt(ext[0])}×${fmt(ext[1])}×${fmt(ext[2])}).`,
        }
      }
      return OK
    }

    case 'housing': {
      // b must seat into a's face by at least the dado depth (default t_a/3).
      const depth = typeof params.depth === 'number' ? params.depth : a.dims.t / 3
      const penetration = Math.min(ext[0], ext[1], ext[2])
      if (penetration + 1e-9 < depth) {
        return {
          ok: false,
          reason: `${b.name} seats only ${fmt(penetration)} into ${a.name} — a housing needs ≥ ${fmt(depth)} (default t_a/3). Increase the overlap or reduce the depth.`,
        }
      }
      return OK
    }

    case 'mortise_tenon': {
      // b's tenon must engage a by ≥ 1/2" along b's length (the insertion axis, §5.6).
      // bAxes[0] is b's local length direction expressed in the pair frame.
      const insertion = dominantAxis(frame.bAxes[0])
      const engagement = ext[insertion]
      if (engagement + 1e-9 < MT_MIN_ENGAGEMENT) {
        return {
          ok: false,
          reason: `${b.name} engages ${a.name} by only ${fmt(engagement)} — a mortise & tenon needs ≥ ${fmt(MT_MIN_ENGAGEMENT)} of engagement. Push ${b.name} deeper into ${a.name}.`,
        }
      }
      return OK
    }

    // box_joint / dovetail / miter geometry is deferred this chunk (§5.7/§5.8/§5.9);
    // contact is still required so an obviously-disjoint pair is caught.
    default:
      return OK
  }
}
