// §7.6 — machining notes. For each board, the aggregated joinery operations it requires
// ("tenon 3/8 × 3 × 1-1/4", "dado 3/4 × 1/4", "drill 3/8 dowel ×4", "groove 1/4 × 3/8, bottom").
//
// These are DERIVED FROM JOINT PARAMS + BOARD DIMS only — no geometry overlap, no Manifold.
// That keeps this module on the WASM-free base entry so the server's cut-list route (§6
// invariant: server bundle has 0 manifold refs) can produce notes too. The dimension
// formulas mirror the JointFn defaults in src/eval/joints/* (the source of truth for the
// actual carve); a few values that the carve derives from the world overlap (tenon length,
// fastener count) are approximated from board dims here — shop-accurate, not carve-exact.
// If a JointFn default changes, update the matching branch below.

import type { Model } from '../model.js'
import type { Board, EdgeProfile } from '../board.js'
import type { Joint } from '../joint.js'
import { fmtFraction } from './format.js'
import { profileExtents } from '../geometry/edgeProfiles.js'
// The box/dovetail spacing solvers are PURE (numbers in / layout out, no WASM, no Board) —
// so notes.ts can reuse them and stay on the WASM-free base entry instead of duplicating
// the count/width math. They're already reached from that entry via geometry/preconditions.
// (Other joints' dims here are still hand-duplicated defaults, per the header note above.)
import { boxSpacing, dovetailSpacing } from '../eval/joints/spacing.js'

// role on a Joint: a = receives (mortised/dadoed/rabbeted), b = inserts (tenoned/housed).
type Push = (boardId: string, note: string) => void

export function machiningNotes(model: Model, precision = 16): Map<string, string[]> {
  const byId = new Map(model.boards.map((b) => [b.id, b]))
  const raw = new Map<string, string[]>()
  const push: Push = (boardId, note) => {
    const arr = raw.get(boardId)
    if (arr) arr.push(note)
    else raw.set(boardId, [note])
  }
  const f = (n: number) => fmtFraction(n, precision)

  // Board-level edge grooves (§3.4) — not a joint, but real machining.
  for (const board of model.boards) {
    for (const g of board.edge_grooves) {
      push(board.id, `groove ${f(g.width)} × ${f(g.depth)}, ${g.edge}`)
    }
    // Board-level edge profiles (§3.5, router mode). Arris-independent so the same bit
    // run on two arrises collapses to "note ×2"; the geometry is stored on the board,
    // not looked up from the bit store.
    for (const p of board.edge_profiles ?? []) {
      push(board.id, edgeProfileNote(p, f))
    }
  }

  for (const joint of model.joints) {
    if (joint.enabled === false) continue
    const a = byId.get(joint.a)
    const b = byId.get(joint.b)
    if (!a || !b) continue
    jointNote(joint, a, b, push, f)
  }

  // Collapse duplicate notes on a board into "note ×N" (e.g. a rail tenoned on both ends).
  const out = new Map<string, string[]>()
  for (const [id, arr] of raw) out.set(id, dedupeCounts(arr))
  return out
}

function jointNote(joint: Joint, a: Board, b: Board, push: Push, f: (n: number) => string): void {
  switch (joint.type) {
    case 'butt': {
      const p = joint.params
      if (p.fastener == null || p.fastener === 'none') return
      const count = p.count ?? 2 // §5.1 auto: 1 per 3" of joint width, min 2 — overlap-free fallback
      const note =
        p.fastener === 'dowel'
          ? `drill ${f(p.dia)} dowel ×${count}`
          : `${FASTENER_LABEL[p.fastener]} ×${count}`
      push(a.id, note) // both members are drilled/fastened
      push(b.id, note)
      return
    }
    case 'rabbet': {
      const depth = joint.params.depth ?? a.dims.t / 2
      const width = joint.params.width ?? b.dims.t
      push(a.id, `rabbet ${f(width)} × ${f(depth)}`)
      return
    }
    case 'housing': {
      const depth = joint.params.depth ?? a.dims.t / 3
      const width = b.dims.t // dado as wide as the shelf's thickness
      push(a.id, `${joint.params.stopped ? 'stopped dado' : 'dado'} ${f(width)} × ${f(depth)}`)
      return
    }
    case 'half_lap': {
      push(a.id, 'half-lap')
      push(b.id, 'half-lap')
      return
    }
    case 'bridle': {
      push(a.id, 'bridle slot')
      push(b.id, 'bridle tenon')
      return
    }
    case 'mortise_tenon': {
      const p = joint.params
      const frac = p.thickness_fraction ?? 1 / 3
      let thk = p.thickness ?? frac * b.dims.t
      if (p.snap_to_tool !== false) thk = Math.round(thk / (1 / 16)) * (1 / 16) // snap 1/16 (§5.6)
      thk = Math.min(thk, a.dims.t)
      const sh = p.width_shoulders ?? [3 / 8, 3 / 8]
      // Width layout mirrors the carve (docs/chunk12-design.md §2/§5), approximated from
      // board dims: the haunch band replaces its side's shoulder (default L = U/4), and
      // twin splits the remainder into tenon/gap/tenon thirds.
      const haunch = p.haunch ?? 'none'
      let usable = Math.max(0, b.dims.w - (sh[0] ?? 0) - (sh[1] ?? 0))
      let haunchLen = 0
      if (haunch !== 'none') {
        const U = Math.max(0, b.dims.w - Math.min(sh[0] ?? 0, sh[1] ?? 0)) // smaller shoulder survives
        haunchLen = p.haunch_len ?? U / 4
        usable = Math.max(0, U - haunchLen)
      }
      const width = p.twin ? usable / 3 : usable
      // through vs blind: explicit flag wins; else a given depth means blind, otherwise
      // assume a through tenon (length = the mortised member's thickness).
      const through = typeof p.through === 'boolean' ? p.through : p.depth == null
      const length = through ? a.dims.t : (p.depth ?? a.dims.t)
      const copies = p.twin ? 2 : 1
      for (let i = 0; i < copies; i++) {
        push(a.id, `mortise ${f(thk)} × ${f(width)}, ${through ? 'through' : `${f(length)} deep`}`)
        push(b.id, `tenon ${f(thk)} × ${f(width)} × ${f(length)}`)
      }
      if (haunch !== 'none') {
        // §3.4 live derivation: default haunch depth = the governing groove on a
        // (approximated dims-only as the deepest groove; carve-exact pick needs overlap).
        const deepest = a.edge_grooves.reduce((d, g) => Math.max(d, g.depth), 0)
        const depth = p.haunch_depth ?? (deepest > 0 ? deepest : a.dims.t / 3)
        push(b.id, `${haunch} haunch ${f(haunchLen)} × ${f(depth)}`)
      }
      if (p.wedged && through) {
        const kerfs = p.wedge_kerfs ?? 2
        push(a.id, `flare mortise exit 1/8 per side for wedges`)
        push(b.id, `saw ${kerfs * copies} wedge kerfs, stop 1/2 from shoulder`)
      }
      if (p.drawbore) {
        const dia = p.pin_dia ?? 3 / 8
        const off = p.drawbore_offset ?? 1 / 16
        for (let i = 0; i < copies; i++) {
          push(a.id, `drill ${f(dia)} drawbore`)
          push(b.id, `drill ${f(dia)} drawbore, offset ${f(off)} toward shoulder`)
        }
      }
      return
    }
    case 'box_joint': {
      // W / t_thin approximated from board dims (shop-accurate, not carve-exact — the carve
      // uses the actual overlap R); the finger count + pin width come from the §2 solver.
      const W = Math.min(a.dims.w, b.dims.w)
      const tThin = Math.min(a.dims.t, b.dims.t)
      const pinWidth = typeof joint.params.pin_width === 'number' ? joint.params.pin_width : undefined
      const lay = boxSpacing(W, tThin, { pinWidth })
      const note = `box joint ${lay.n} fingers × ${f(lay.p)}`
      push(a.id, note)
      push(b.id, note)
      return
    }
    case 'dovetail': {
      const p = joint.params
      const slope = typeof p.slope === 'string' ? p.slope : '1:8'
      const variant = p.variant === 'half_blind' ? 'half_blind' : 'through'
      const W = Math.min(a.dims.w, b.dims.w)
      // Dims-only depth: through runs the full t_a; half-blind stops at the lap wall.
      const lapEff = variant === 'half_blind' ? (typeof p.lap === 'number' ? p.lap : a.dims.t / 4) : 0
      const ell = Math.max(0, a.dims.t - lapEff)
      const pins = p.pins === 'auto' || typeof p.pins === 'number' ? p.pins : 'auto'
      const halfPinWidth = typeof p.half_pin_width === 'number' ? p.half_pin_width : undefined
      const lay = dovetailSpacing({ W, tB: b.dims.t, ell, slope, pins, halfPinWidth })
      const lapNote = variant === 'half_blind' ? `, half-blind lap ${f(lapEff)}` : ''
      push(a.id, `dovetail sockets: ${lay.tails} tails ${slope}${lapNote}`)
      push(b.id, `dovetail tails: ${lay.tails} @ ${f(lay.meanTail)}`)
      return
    }
    case 'miter':
      push(a.id, 'miter')
      push(b.id, 'miter')
      return
  }
}

// §3.5 router-bit machining note — one line per profile, arris-independent (see caller).
function edgeProfileNote(p: EdgeProfile, f: (n: number) => string): string {
  switch (p.profile) {
    case 'roundover':
      return `roundover ${f(p.radius)}R`
    case 'cove':
      return `cove ${f(p.radius)}R`
    case 'ogee':
      return `ogee ${f(p.radius)}R`
    case 'chamfer':
      return `chamfer ${f(p.width)} (45°)`
    case 'rabbet':
      return `rabbet ${f(p.width)} × ${f(p.depth)}`
    case 'compound': {
      // No closed-form dims — prefer the bit's human label; fall back to the swept extents.
      if (p.label) return p.label
      const { reach, depth } = profileExtents(p)
      return `molding ${f(reach)} × ${f(depth)}`
    }
  }
}

const FASTENER_LABEL: Record<'screw' | 'domino' | 'pocket_screw', string> = {
  screw: 'screw',
  domino: 'Domino',
  pocket_screw: 'pocket screw',
}

function dedupeCounts(notes: string[]): string[] {
  const counts = new Map<string, number>()
  for (const n of notes) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
}
