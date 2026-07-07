// §5.7 box_joint (docs/chunk16-design.md §2–3). Two board ends interlock at a corner:
// the joint width W runs along a's width (wAxis=1), fingers alternate across it, and each
// finger runs through a's thickness (eAxis=2) and the mating board's thickness (sAxis=0).
// The odd-count solver (spacing.ts) partitions W into bands; a removes its non-`start`-
// parity bands, b removes the complement, so the two boards exactly tile the corner cube
// (§6.1 complement invariant). Every cutter is a plain box; central overcut (solids.ts)
// opens the flush faces per the §1 open-face table — the JointFn emits EXACT boxes only.
import type { JointFn, Cutter } from '../types.js'
import type { Warning } from '../../common.js'
import { WarningCode } from '../../common.js'
import { CONTACT_TOL } from '../../geometry/preconditions.js'
import { boxSpacing } from './spacing.js'
import {
  worldOverlap,
  toLocal,
  fromR,
  spanBox,
  extent,
  lengthAxisW,
  widthAxisW,
  otherAxis,
} from './util.js'

export const boxJoint: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }

  // Corner frame (§1). The precondition guarantees b's length runs along a's thickness
  // (eAxis) and the widths are parallel (wAxis); sAxis is the remaining axis.
  const eAxis = lengthAxisW(b) // a's thickness (=2): fingers run through it
  const wAxis = widthAxisW(b) // shared width (=1): the joint runs along it
  const sAxis = otherAxis(eAxis, wAxis) // a's length = b's thickness (=0)

  const W = extent(R)[wAxis]
  const tThin = Math.min(a.board.dims.t, b.board.dims.t)
  const pinWidth = typeof params.pin_width === 'number' ? params.pin_width : undefined
  const start = params.start === 'socket' ? 'socket' : 'pin'

  const lay = boxSpacing(W, tThin, { pinWidth })
  const warnings: Warning[] = [...lay.warnings]

  // Flushness lint — a box joint is through by definition (§3). If b stops short of a's
  // outer face (eAxis) or a's end doesn't reach through b's thickness (sAxis), warn and
  // carve at the actual overlap R.
  const tA = extent(a.aabb)[eAxis]
  const tBthick = extent(b.aabb)[sAxis]
  const eGap = tA - extent(R)[eAxis]
  const sGap = tBthick - extent(R)[sAxis]
  if (eGap > CONTACT_TOL || sGap > CONTACT_TOL) {
    const gap = Math.max(eGap, sGap)
    warnings.push({
      code: WarningCode.BOX_NOT_THROUGH,
      msg: `${b.board.name}'s end sits ${fmt(gap)} short of ${a.board.name}'s outer face — box fingers should run through. Slide ${b.board.name} flush.`,
    })
  }

  // Bands partition W; a keeps its `start`-parity fingers (index 0 kept when start='pin'),
  // b holds the complement. A board REMOVES the bands where the other board keeps material.
  const aKeepsEven = start === 'pin'
  const aCut: Cutter[] = []
  const bCut: Cutter[] = []
  for (let i = 0; i < lay.n; i++) {
    const lo = R.min[wAxis] + lay.stations[i]
    const hi = R.min[wAxis] + lay.stations[i + 1]
    if (hi - lo <= 1e-9) continue
    const s = fromR(R)
    s[wAxis] = [lo, hi]
    const box = spanBox(s) // spans full R in sAxis + eAxis; overcut opens the flush faces
    const aKeeps = (i % 2 === 0) === aKeepsEven
    if (aKeeps) bCut.push(toLocal(b, box, 'finger'))
    else aCut.push(toLocal(a, box, 'finger'))
  }

  return { a: aCut, b: bCut, warnings }
}

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`
