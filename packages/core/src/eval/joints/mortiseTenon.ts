// §5.6 mortise_tenon (flagship) — chunk 10 carved the core (mortise pocket, shouldered/
// cheeked tenon, through/blind derivation, width_shoulders, snap_to_tool, the THIN_* /
// NEAR_THROUGH warnings). Chunk 12 (docs/chunk12-design.md) adds the rest of the param
// set: haunch (square/sloped — depth derived live from the governing edge_groove, §3.4),
// wedged (mortise exit flare + tenon kerfs), twin (two tenons across b's width), and
// drawbore (no carve — machining notes + ghost pins via eval/markers.ts; the pin fills
// its hole, so subtracting it would only churn the mesh).
//
// Everything is derived in layout() so drawborePins() (the markers seam) and the carve
// share one source of truth. Boxes and frustums are the TRUE cut geometry; overcut opens
// flush faces centrally at carve time (gotcha #4).
import type { JointFn, Cutter, BoardSolid } from '../types.js'
import type { Warning } from '../../common.js'
import { WarningCode } from '../../common.js'
import type { EdgeGroove } from '../../board.js'
import { CONTACT_TOL } from '../../geometry/preconditions.js'
import { frustumRectAxes } from '../types.js'
import {
  worldOverlap,
  toLocal,
  toLocalFrustum,
  fromR,
  spanBox,
  extent,
  center,
  lengthAxisW,
  thickAxisW,
  otherAxis,
  snap,
  type Axis,
  type AABB,
  type Vec3,
} from './util.js'

const THIN = 1 / 4 // in — thin tenon / thin mortise wall threshold (§5.6)
const NEAR_THROUGH_GAP = 1 / 8 // in — blind within this of breaking through (§5.6)
const FLARE = 1 / 8 // in — wedged: mortise widened per side at the exit face (§5.6)
const KERF = 1 / 16 // in — wedge kerf saw width
const KERF_STOP = 1 / 2 // in — kerf stops this short of the shoulder (§5.6)
const BAND_TOL = 1 / 64 // in — haunch stub vs groove alignment tolerance

type Band = [number, number]

interface MTLayout {
  R: AABB
  eAxis: Axis // insertion (tenon length into a)
  tAxis: Axis // tenon thickness
  wAxis: Axis // tenon width
  tenonThk: number
  tBand: Band // thickness band of the tenon/mortise (pair frame)
  through: boolean
  depth: number // blind depth; = aThrough for through joints
  aThrough: number
  bBodyHigh: boolean // b's body (and the entry face) on the high side of eAxis
  entryFace: number // a's face coordinate where the tenon enters
  bE: Band // tenon length span (b's end → shoulder line)
  tenonBands: Band[] // 1, or 2 for twin, along wAxis
  gapBand: Band | null // twin: the removed middle third
  haunch: 'none' | 'square' | 'sloped'
  haunchBand: Band | null // along wAxis; replaces that side's width shoulder
  haunchInnerHigh: boolean // true when the band's INNER (main-tenon) edge is its high end
  haunchDepth: number
  shoulders: { lo: number; hi: number; haunchSide: 'lo' | 'hi' | null }
  wedged: boolean // effective: param && through
  wedgeKerfs: number
  pins: { w: number; e: number }[] // drawbore pin centres along (wAxis, eAxis)
  pinDia: number
  warnings: Warning[]
}

function layout(a: BoardSolid, b: BoardSolid, params: Record<string, unknown>): MTLayout | null {
  const R = worldOverlap(a, b)
  if (!R) return null
  const warnings: Warning[] = []

  const eAxis = lengthAxisW(b)
  const tAxis = thickAxisW(b)
  const wAxis = otherAxis(eAxis, tAxis)

  // Tenon thickness: absolute override wins over the fraction-of-t_b; snap to 1/16.
  const tB = b.board.dims.t
  const frac = typeof params.thickness_fraction === 'number' ? params.thickness_fraction : 1 / 3
  let tenonThk = typeof params.thickness === 'number' ? params.thickness : frac * tB
  if (params.snap_to_tool !== false) tenonThk = snap(tenonThk, 1 / 16)
  const aThick = extent(a.aabb)[tAxis]
  tenonThk = Math.min(tenonThk, aThick)
  const cT = center(R)[tAxis]
  const tBand: Band = [cT - tenonThk / 2, cT + tenonThk / 2]

  // Through vs. blind, and the mortise depth.
  const aThrough = extent(a.aabb)[eAxis]
  const engagement = extent(R)[eAxis]
  const through =
    typeof params.through === 'boolean' ? params.through : engagement >= aThrough - CONTACT_TOL
  let depth = typeof params.depth === 'number' ? params.depth : engagement
  if (!through) depth = Math.min(depth, aThrough - CONTACT_TOL)
  else depth = aThrough

  const bBodyHigh = center(b.aabb)[eAxis] >= center(a.aabb)[eAxis]
  const entryFace = bBodyHigh ? a.aabb.max[eAxis] : a.aabb.min[eAxis]
  const bE: Band = bBodyHigh
    ? [b.aabb.min[eAxis], R.max[eAxis]]
    : [R.min[eAxis], b.aabb.max[eAxis]]

  // ── Width layout: shoulders → haunch band → twin thirds ─────────────────────
  const sh = Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[]) : [3 / 8, 3 / 8]
  const shLo = Math.max(0, sh[0] ?? 0)
  const shHi = Math.max(0, sh[1] ?? 0)
  let loBound = R.min[wAxis] + shLo
  let hiBound = R.max[wAxis] - shHi

  const haunch = (typeof params.haunch === 'string' ? params.haunch : 'none') as MTLayout['haunch']
  let haunchBand: Band | null = null
  let haunchInnerHigh = false
  let haunchDepth = 0
  let haunchSide: 'lo' | 'hi' | null = null
  if (haunch !== 'none') {
    // The stub belongs where the stile ends (a flush frame corner has margin 0);
    // a mid-stile haunch (both margins large) is legitimate anti-twist for wide rails.
    const marginLo = R.min[wAxis] - a.aabb.min[wAxis]
    const marginHi = a.aabb.max[wAxis] - R.max[wAxis]
    haunchSide = marginLo <= marginHi ? 'lo' : 'hi'
    // Band width: spec default "1/3 of tenon width" solved against tenonW = U − L → U/4.
    const U = extent(R)[wAxis] - (haunchSide === 'lo' ? shHi : shLo)
    const L = Math.min(typeof params.haunch_len === 'number' ? params.haunch_len : U / 4, U)
    if (haunchSide === 'lo') {
      loBound = R.min[wAxis] + L
      haunchBand = [R.min[wAxis], loBound]
      haunchInnerHigh = true
    } else {
      hiBound = R.max[wAxis] - L
      haunchBand = [hiBound, R.max[wAxis]]
      haunchInnerHigh = false
    }

    // §3.4 live derivation: haunch_depth defaults to the governing edge_groove's depth —
    // the groove on the face of a the tenon enters through, slotted along a's thickness.
    const groove = governingGroove(a, eAxis, bBodyHigh, tAxis, tBand)
    haunchDepth =
      typeof params.haunch_depth === 'number' ? params.haunch_depth : groove?.depth ?? a.board.dims.t / 3
    if (!groove) {
      warnings.push({
        code: WarningCode.HAUNCH_NO_GROOVE,
        msg: `Haunched tenon, but ${a.board.name} has no panel groove on the mortised edge for the haunch to fill — using ${fmt(haunchDepth)} deep. Add an edge groove or set haunch_depth explicitly.`,
      })
    } else if (haunch === 'sloped') {
      warnings.push({
        code: WarningCode.HAUNCH_GROOVE_MISMATCH,
        msg: `Sloped haunch tapers to nothing at the end grain, so it cannot fill the groove run-out on ${a.board.name}. Use a square haunch to fill the groove.`,
      })
    } else if (
      Math.abs(groove.offset - cT) > BAND_TOL ||
      Math.abs(groove.width - tenonThk) > BAND_TOL
    ) {
      warnings.push({
        code: WarningCode.HAUNCH_GROOVE_MISMATCH,
        msg: `Haunch stub is ${fmt(tenonThk)} centred at ${fmt(cT)}, but ${a.board.name}'s groove is ${fmt(groove.width)} at offset ${fmt(groove.offset)} — the stub won't seat. Match the tenon thickness/offset to the groove.`,
      })
    }
  }

  // Twin: usable width in equal thirds — tenon, gap, tenon (shop rule of thumb).
  const twin = params.twin === true
  let tenonBands: Band[] = [[loBound, Math.max(loBound, hiBound)]]
  let gapBand: Band | null = null
  if (twin) {
    const W = Math.max(0, hiBound - loBound)
    const third = W / 3
    tenonBands = [
      [loBound, loBound + third],
      [hiBound - third, hiBound],
    ]
    gapBand = [loBound + third, hiBound - third]
    if (third < THIN) {
      warnings.push({
        code: WarningCode.THIN_MORTISE_WALL,
        msg: `Twin mortises leave a ${fmt(third)} web between them — under ${fmt(THIN)} it may split. Widen ${b.board.name} or drop twin.`,
      })
    }
  }

  // Wedged: through joints only — a blind wedge has nothing to spread against.
  const wedgedParam = params.wedged === true
  const wedged = wedgedParam && through
  if (wedgedParam && !through) {
    warnings.push({
      code: WarningCode.WEDGE_NEEDS_THROUGH,
      msg: `Wedged tenons need a through mortise to flare against — this one is blind. Deepen the engagement or drop wedged; skipping the flare and kerfs.`,
    })
  }
  const wedgeKerfs = typeof params.wedge_kerfs === 'number' ? params.wedge_kerfs : 2

  // Drawbore: pin per tenon, set back 1.5 × dia from the entry face.
  const pins: MTLayout['pins'] = []
  const pinDia = typeof params.pin_dia === 'number' ? params.pin_dia : 3 / 8
  if (params.drawbore === true) {
    const setback = 1.5 * pinDia
    if (setback + pinDia / 2 > depth) {
      warnings.push({
        code: WarningCode.DRAWBORE_NO_ROOM,
        msg: `Drawbore pin sits ${fmt(setback)} in from the shoulder, past the ${fmt(depth)} mortise — the pin would miss the tenon. Deepen the mortise, shrink pin_dia, or drop drawbore.`,
      })
    } else {
      const e = entryFace + (bBodyHigh ? -setback : setback)
      for (const band of tenonBands) pins.push({ w: (band[0] + band[1]) / 2, e })
    }
  }

  // ── Chunk-10 warnings (unchanged) ────────────────────────────────────────────
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

  return {
    R, eAxis, tAxis, wAxis, tenonThk, tBand, through, depth, aThrough, bBodyHigh,
    entryFace, bE, tenonBands, gapBand, haunch, haunchBand, haunchInnerHigh, haunchDepth,
    shoulders: { lo: shLo, hi: shHi, haunchSide }, wedged, wedgeKerfs, pins, pinDia, warnings,
  }
}

// The governing edge groove (§3.4): on the edge of a the tenon enters through, slotted
// along a's local z (which must be the tenon-thickness axis); best band overlap wins.
// The pair frame IS a's local frame, so eAxis/side map straight to groove edge names.
function governingGroove(
  a: BoardSolid,
  eAxis: Axis,
  entryHigh: boolean,
  tAxis: Axis,
  tBand: Band,
): EdgeGroove | null {
  if (tAxis !== 2) return null // groove slots span a's thickness (local z)
  const edge =
    eAxis === 0 ? (entryHigh ? 'right' : 'left') : eAxis === 1 ? (entryHigh ? 'top' : 'bottom') : null
  if (!edge) return null
  // Best slot-band overlap with the mortise wins; a groove on the right edge but clear
  // of the band still governs (nearest centre) — it fires the MISMATCH warning rather
  // than pretending no groove exists.
  let best: EdgeGroove | null = null
  let bestScore = -Infinity
  for (const g of a.board.edge_grooves) {
    if (g.edge !== edge) continue
    const overlap = Math.min(tBand[1], g.offset + g.width / 2) - Math.max(tBand[0], g.offset - g.width / 2)
    const score = overlap > 0 ? overlap : -Math.abs(g.offset - (tBand[0] + tBand[1]) / 2)
    if (score > bestScore) {
      bestScore = score
      best = g
    }
  }
  return best
}

export const mortiseTenon: JointFn = (a, b, params) => {
  const lay = layout(a, b, params)
  if (!lay) return { a: [], b: [], warnings: [] }
  const {
    R, eAxis, tAxis, wAxis, tBand, through, depth, bBodyHigh, entryFace, bE,
    tenonBands, gapBand, haunch, haunchBand, haunchInnerHigh, haunchDepth, shoulders, wedged,
    wedgeKerfs, warnings,
  } = lay

  const aCut: Cutter[] = []
  const bCut: Cutter[] = []
  // Zero-extent cutters (degenerate bands from extreme params) are skipped, not carved.
  const pushBox = (out: Cutter[], s: ReturnType<typeof fromR>, tgt: BoardSolid, feature: Parameters<typeof toLocal>[2]) => {
    const box = spanBox(s)
    for (let i = 0; i < 3; i++) if (box.max[i] - box.min[i] <= 1e-9) return
    out.push(toLocal(tgt, box, feature))
  }
  // Frustum rects: coords are the two non-sweep axes in ASCENDING order — place the
  // (wRange, tRange) or (tRange, eRange) pair accordingly.
  const rectFor = (sweep: Axis, ranges: Partial<Record<Axis, Band>>) => {
    const [u, v] = frustumRectAxes(sweep)
    const ru = ranges[u as Axis]!
    const rv = ranges[v as Axis]!
    return { min: [ru[0], rv[0]] as [number, number], max: [ru[1], rv[1]] as [number, number] }
  }

  // ── a: mortise pocket(s) — flared frustums when wedged, boxes otherwise ─────
  const eSpan: Band = through
    ? [a.aabb.min[eAxis], a.aabb.max[eAxis]]
    : bBodyHigh
      ? [a.aabb.max[eAxis] - depth, a.aabb.max[eAxis]]
      : [a.aabb.min[eAxis], a.aabb.min[eAxis] + depth]
  for (const band of tenonBands) {
    if (band[1] - band[0] <= 1e-9) continue
    if (wedged) {
      // §5.6: exit face widened by 1/8 per side; linear taper from the nominal entry.
      const flared: Band = [
        Math.max(a.aabb.min[wAxis], band[0] - FLARE),
        Math.min(a.aabb.max[wAxis], band[1] + FLARE),
      ]
      const entryRect = rectFor(eAxis, { [wAxis]: band, [tAxis]: tBand } as Partial<Record<Axis, Band>>)
      const exitRect = rectFor(eAxis, { [wAxis]: flared, [tAxis]: tBand } as Partial<Record<Axis, Band>>)
      aCut.push(
        toLocalFrustum(
          a,
          {
            axis: eAxis,
            span: eSpan,
            rectLo: bBodyHigh ? exitRect : entryRect, // exit is opposite the entry face
            rectHi: bBodyHigh ? entryRect : exitRect,
          },
          'mortise',
        ),
      )
    } else {
      const m = fromR(R)
      m[wAxis] = band
      m[tAxis] = tBand
      m[eAxis] = eSpan
      pushBox(aCut, m, a, 'mortise')
    }
  }

  // a: haunch socket — always emitted; coplanar with a matching groove it unions to a
  // no-op, otherwise it carves the socket a shop would chop (docs/chunk12-design.md §2).
  if (haunch !== 'none' && haunchBand && haunchDepth > 1e-9) {
    const socketE: Band = bBodyHigh
      ? [entryFace - haunchDepth, entryFace]
      : [entryFace, entryFace + haunchDepth]
    if (haunch === 'square') {
      const s = fromR(R)
      s[wAxis] = haunchBand
      s[tAxis] = tBand
      s[eAxis] = socketE
      pushBox(aCut, s, a, 'haunch')
    } else {
      const fullRect = rectFor(wAxis, { [tAxis]: tBand, [eAxis]: socketE } as Partial<Record<Axis, Band>>)
      const zeroRect = rectFor(wAxis, {
        [tAxis]: tBand,
        [eAxis]: [entryFace, entryFace] as Band,
      } as Partial<Record<Axis, Band>>)
      aCut.push(
        toLocalFrustum(
          a,
          {
            axis: wAxis,
            span: haunchBand,
            rectLo: haunchInnerHigh ? zeroRect : fullRect, // depth at the inner (tenon) edge, 0 at the board edge
            rectHi: haunchInnerHigh ? fullRect : zeroRect,
          },
          'haunch',
        ),
      )
    }
  }

  // ── b: cheeks (thickness) — unchanged; the haunch stub is tenon-thickness too ──
  const cheekLo = fromR(R)
  cheekLo[tAxis] = [R.min[tAxis], tBand[0]]
  cheekLo[eAxis] = bE
  pushBox(bCut, cheekLo, b, 'tenon_cheek')
  const cheekHi = fromR(R)
  cheekHi[tAxis] = [tBand[1], R.max[tAxis]]
  cheekHi[eAxis] = bE
  pushBox(bCut, cheekHi, b, 'tenon_cheek')

  // b: width shoulders — the haunch side's shoulder is replaced by the haunch band.
  if (shoulders.lo > 0 && shoulders.haunchSide !== 'lo') {
    const s = fromR(R)
    s[wAxis] = [R.min[wAxis], R.min[wAxis] + shoulders.lo]
    s[eAxis] = bE
    pushBox(bCut, s, b, 'shoulder')
  }
  if (shoulders.hi > 0 && shoulders.haunchSide !== 'hi') {
    const s = fromR(R)
    s[wAxis] = [R.max[wAxis] - shoulders.hi, R.max[wAxis]]
    s[eAxis] = bE
    pushBox(bCut, s, b, 'shoulder')
  }

  // b: haunch — remove the band beyond the stub (square) or the sloped complement.
  if (haunch !== 'none' && haunchBand) {
    const stubE: Band = bBodyHigh ? [bE[0], bE[1] - haunchDepth] : [bE[0] + haunchDepth, bE[1]]
    if (haunch === 'square') {
      const s = fromR(R)
      s[wAxis] = haunchBand
      s[eAxis] = stubE
      pushBox(bCut, s, b, 'haunch')
    } else if (bE[1] - bE[0] > 1e-9) {
      // Sloped: removal starts at the stub tip on the inner edge and at the shoulder
      // line on the board edge (stub depth tapers to zero — hidden from the end grain).
      const tFull: Band = [R.min[tAxis], R.max[tAxis]]
      const innerRect = rectFor(wAxis, { [tAxis]: tFull, [eAxis]: stubE } as Partial<Record<Axis, Band>>)
      const outerRect = rectFor(wAxis, { [tAxis]: tFull, [eAxis]: bE } as Partial<Record<Axis, Band>>)
      bCut.push(
        toLocalFrustum(
          b,
          {
            axis: wAxis,
            span: haunchBand,
            rectLo: haunchInnerHigh ? outerRect : innerRect,
            rectHi: haunchInnerHigh ? innerRect : outerRect,
          },
          'haunch',
        ),
      )
    }
  }

  // b: twin — remove the middle third between the two tenons.
  if (gapBand && gapBand[1] - gapBand[0] > 1e-9) {
    const s = fromR(R)
    s[wAxis] = gapBand
    s[eAxis] = bE
    pushBox(bCut, s, b, 'shoulder')
  }

  // b: wedge kerfs — evenly spaced across each tenon, stopping short of the shoulder.
  if (wedged) {
    const kerfE: Band = bBodyHigh ? [bE[0], bE[1] - KERF_STOP] : [bE[0] + KERF_STOP, bE[1]]
    if (kerfE[1] - kerfE[0] > 1e-9) {
      for (const band of tenonBands) {
        for (let i = 0; i < wedgeKerfs; i++) {
          const wc = band[0] + ((i + 1) / (wedgeKerfs + 1)) * (band[1] - band[0])
          const s = fromR(R)
          s[wAxis] = [wc - KERF / 2, wc + KERF / 2]
          s[tAxis] = tBand
          s[eAxis] = kerfE
          pushBox(bCut, s, b, 'kerf')
        }
      }
    }
  }

  return { a: aCut, b: bCut, warnings }
}

// Drawbore ghost-pin placements for eval/markers.ts, in the PAIR frame (a's local frame):
// one pin per tenon, axis along the tenon-thickness axis, running through a plus a hair
// of proud so it reads as a pin. Same layout() as the carve — one source of truth.
export function drawborePins(
  a: BoardSolid,
  b: BoardSolid,
  params: Record<string, unknown>,
): { center: Vec3; axis: Axis; dia: number; len: number }[] {
  const lay = layout(a, b, params)
  if (!lay) return []
  return lay.pins.map((p) => {
    const c: Vec3 = [0, 0, 0]
    c[lay.wAxis] = p.w
    c[lay.eAxis] = p.e
    c[lay.tAxis] = center(a.aabb)[lay.tAxis]
    return { center: c, axis: lay.tAxis, dia: lay.pinDia, len: extent(a.aabb)[lay.tAxis] + 1 / 4 }
  })
}

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`
