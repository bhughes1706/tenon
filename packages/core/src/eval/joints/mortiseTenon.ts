// §5.6 mortise_tenon (flagship) — board a is mortised (a pocket); board b's end becomes
// a shouldered tenon that inserts into it. This chunk carves: the mortise pocket, the
// shouldered/cheeked tenon, through vs. blind (derived), width_shoulders, snap_to_tool,
// and the THIN_TENON / THIN_MORTISE_WALL / NEAR_THROUGH warnings.
//
// Deferred (param accepted, geometry not carved → JOINT_FEATURE_UNIMPLEMENTED warning):
// wedged, drawbore, twin, and BOTH haunch styles. The design (§5.6) scoped a square
// haunch in; we defer it too because a haunch only matters when filling a stile's
// edge_groove and a wrong haunch carve is worse than a clear "not yet" — see
// docs/chunk9-design.md.
//
// Boxes are EXACT; the carve opens the mortise faces, the tenon end, and the cheek/
// shoulder outer faces (overcutToBoard, gotcha #4). Interior faces (the tenon cheeks,
// the shoulder line, a blind mortise floor) stay exact.
import type { JointFn, CutterBox } from '../types.js'
import type { Warning } from '../../common.js'
import { WarningCode } from '../../common.js'
import { CONTACT_TOL } from '../../geometry/preconditions.js'
import {
  worldOverlap,
  toLocal,
  fromR,
  spanBox,
  extent,
  center,
  lengthAxisW,
  thickAxisW,
  otherAxis,
  snap,
  unimplemented,
} from './util.js'

const THIN = 1 / 4 // in — thin tenon / thin mortise wall threshold (§5.6)
const NEAR_THROUGH_GAP = 1 / 8 // in — blind within this of breaking through (§5.6)

export const mortiseTenon: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }
  const warnings: Warning[] = []

  // Deferred sub-features.
  for (const f of ['wedged', 'drawbore', 'twin'] as const) {
    if (params[f] === true) warnings.push(unimplemented('mortise_tenon', f))
  }
  const haunch = typeof params.haunch === 'string' ? params.haunch : 'none'
  if (haunch !== 'none') warnings.push(unimplemented('mortise_tenon', `haunch '${haunch}'`))

  const eAxis = lengthAxisW(b) // insertion (tenon length into a)
  const tAxis = thickAxisW(b) // tenon thickness
  const wAxis = otherAxis(eAxis, tAxis) // tenon width

  // Tenon thickness: absolute override wins over the fraction-of-t_b; snap to 1/16.
  const tB = b.board.dims.t
  const frac = typeof params.thickness_fraction === 'number' ? params.thickness_fraction : 1 / 3
  let tenonThk = typeof params.thickness === 'number' ? params.thickness : frac * tB
  if (params.snap_to_tool !== false) tenonThk = snap(tenonThk, 1 / 16)
  const aThick = extent(a.aabb)[tAxis] // mortised member thickness across the tenon
  tenonThk = Math.min(tenonThk, aThick)

  // Through vs. blind, and the mortise depth.
  const aThrough = extent(a.aabb)[eAxis] // dimension the tenon passes through
  const engagement = extent(R)[eAxis]
  const through =
    typeof params.through === 'boolean' ? params.through : engagement >= aThrough - CONTACT_TOL
  // Blind depth defaults to the current engagement; a deeper override is capped just shy
  // of breaking through (stays blind), with a thin remaining wall warned via NEAR_THROUGH
  // below — the design's t_a−1/4 guidance becomes a warning, not a silent clamp.
  let depth = typeof params.depth === 'number' ? params.depth : engagement
  if (!through) depth = Math.min(depth, aThrough - CONTACT_TOL)

  // Width shoulders reduce the tenon below b's full width (0 = full-width tenon).
  const sh = Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[]) : [3 / 8, 3 / 8]
  const shLo = Math.max(0, sh[0] ?? 0)
  const shHi = Math.max(0, sh[1] ?? 0)

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (tenonThk < THIN) {
    warnings.push({
      code: WarningCode.THIN_TENON,
      msg: `Tenon is ${fmt(tenonThk)} thick — under ${fmt(THIN)} it is fragile. Increase thickness or stock.`,
    })
  }
  const wall = (aThick - tenonThk) / 2
  if (wall < THIN) {
    warnings.push({
      code: WarningCode.THIN_MORTISE_WALL,
      msg: `Mortise walls are ${fmt(wall)} — under ${fmt(THIN)} they may blow out. Thin the tenon or thicken ${a.board.name}.`,
    })
  }
  if (!through && aThrough - depth < NEAR_THROUGH_GAP) {
    warnings.push({
      code: WarningCode.NEAR_THROUGH,
      msg: `Blind mortise leaves only ${fmt(aThrough - depth)} of wall — within ${fmt(NEAR_THROUGH_GAP)} of breaking through. Reduce depth or make it a through joint.`,
    })
  }

  // ── Mortise (cuttersA): a pocket centred in a's thickness & the tenon's width ──
  const cT = center(R)[tAxis]
  const mortise = fromR(R)
  mortise[tAxis] = [cT - tenonThk / 2, cT + tenonThk / 2]
  mortise[wAxis] = [R.min[wAxis] + shLo, R.max[wAxis] - shHi]
  const contactHigh = center(R)[eAxis] >= center(a.aabb)[eAxis]
  mortise[eAxis] = through
    ? [a.aabb.min[eAxis], a.aabb.max[eAxis]]
    : contactHigh
      ? [a.aabb.max[eAxis] - depth, a.aabb.max[eAxis]]
      : [a.aabb.min[eAxis], a.aabb.min[eAxis] + depth]
  const aCut: CutterBox[] = [toLocal(a, spanBox(mortise), 'mortise')]

  // ── Tenon (cuttersB): remove the two cheeks (thickness) + the shoulders (width) ──
  // over the tenon length — from b's actual end (its tenon-end face) to the shoulder
  // line at a's near face (R) — leaving the central tenon prism.
  const bBodyHigh = center(b.aabb)[eAxis] >= center(a.aabb)[eAxis]
  const bE: [number, number] = bBodyHigh
    ? [b.aabb.min[eAxis], R.max[eAxis]]
    : [R.min[eAxis], b.aabb.max[eAxis]]

  const bCut: CutterBox[] = []
  const cheekLo = fromR(R)
  cheekLo[tAxis] = [R.min[tAxis], cT - tenonThk / 2]
  cheekLo[eAxis] = bE
  bCut.push(toLocal(b, spanBox(cheekLo), 'tenon_cheek'))
  const cheekHi = fromR(R)
  cheekHi[tAxis] = [cT + tenonThk / 2, R.max[tAxis]]
  cheekHi[eAxis] = bE
  bCut.push(toLocal(b, spanBox(cheekHi), 'tenon_cheek'))

  if (shLo > 0) {
    const s = fromR(R)
    s[wAxis] = [R.min[wAxis], R.min[wAxis] + shLo]
    s[eAxis] = bE
    bCut.push(toLocal(b, spanBox(s), 'shoulder'))
  }
  if (shHi > 0) {
    const s = fromR(R)
    s[wAxis] = [R.max[wAxis] - shHi, R.max[wAxis]]
    s[eAxis] = bE
    bCut.push(toLocal(b, spanBox(s), 'shoulder'))
  }

  return { a: aCut, b: bCut, warnings }
}

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`
