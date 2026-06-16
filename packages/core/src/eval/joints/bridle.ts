// §5.5 bridle (open mortise & tenon) — board a gets an open slot in its end (an open
// mortise); board b gets both cheeks removed so its end becomes a centred tenon that
// drops into the slot. Full-width engagement. The tenon thickness is `tenon_fraction`
// of the stock thickness (default 1/3), snapped to 1/8" if snap_to_tool.
//
// a removes the CENTRE thickness band (the slot), b removes the TWO OUTER bands (the
// cheeks) over the same overlap — so they interlock. Boxes are EXACT over the overlap;
// the carve opens each member's end / width faces (overcutToBoard, gotcha #4): the slot
// opens at a's end face, the cheeks at b's end face, both across the full width.
import type { JointFn } from '../types.js'
import {
  worldOverlap,
  toLocal,
  fromR,
  spanBox,
  extent,
  center,
  thickAxisW,
  snap,
} from './util.js'

export const bridle: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }

  const tAxis = thickAxisW(a) // slot / cheeks split across thickness

  const tThick = extent(R)[tAxis]
  const frac = typeof params.tenon_fraction === 'number' ? params.tenon_fraction : 1 / 3
  let tenonThk = frac * tThick
  if (params.snap_to_tool !== false) tenonThk = snap(tenonThk, 1 / 8)
  tenonThk = Math.min(Math.max(tenonThk, 0), tThick)
  const c = center(R)[tAxis]
  const tLo = c - tenonThk / 2
  const tHi = c + tenonThk / 2

  // a: the open slot (centre thickness band over the overlap).
  const slot = fromR(R)
  slot[tAxis] = [tLo, tHi]

  // b: the two cheeks (everything outside the centre tenon band).
  const cheekLo = fromR(R)
  cheekLo[tAxis] = [R.min[tAxis], tLo]
  const cheekHi = fromR(R)
  cheekHi[tAxis] = [tHi, R.max[tAxis]]

  return {
    a: [toLocal(a, spanBox(slot), 'slot')],
    b: [toLocal(b, spanBox(cheekLo), 'cheek'), toLocal(b, spanBox(cheekHi), 'cheek')],
    warnings: [],
  }
}
