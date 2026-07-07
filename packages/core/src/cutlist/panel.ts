// §3.4 / §7 (chunk 15) — panel auto-sizing for a floating panel captured in a surrounding
// frame's edge grooves. See board.ts `PanelFitSchema` for why there's no cross-board
// geometry search here: nothing in the model links a `panel` board to the frame members
// around it, so a board with `panel_fit` set reads its OWN `dims.l`/`dims.w` as the OPENING
// (the reveal it must fill once installed) rather than its milled blank size — a convention
// on the panel board itself, not a derived value.
//
// Fitted blank = opening + 2 × groove_depth (the edge extends into the pocket on both
// sides) − movement gap, and the movement gap only applies to the axis PERPENDICULAR to
// the grain — wood movement along the grain is negligible, so that axis just gets the
// groove-depth extension. Movement gap = crossGrainDim × species.shrink_tan_pct% × 0.6
// (§3.4: 60% of green→oven-dry tangential shrinkage, a flat-sawn seasonal-swing estimate).
// Species unknown or missing shrink_tan_pct → movement gap is 0 (still sized to fill the
// groove; UNKNOWN_SPECIES already flags the missing data elsewhere in the cut list).
//
// A board without `panel_fit` (including non-floating panels, e.g. a glued-up tabletop with
// no frame) passes its dims through unchanged, same as any other board kind.

import type { Board } from '../board.js'
import type { CutlistSpecies } from './cutlist.js'

export interface FittedPanel {
  l: number
  w: number
  movementGap: number // 0 when not applicable
  crossGrainAxis: 'l' | 'w' | null // the axis the movement gap was applied to
  grooveDepth: number // 0 when not applicable
}

export function fitPanel(board: Board, species: CutlistSpecies | undefined): FittedPanel {
  if (board.kind !== 'panel' || !board.panel_fit) {
    return { l: board.dims.l, w: board.dims.w, movementGap: 0, crossGrainAxis: null, grooveDepth: 0 }
  }
  const { groove_depth } = board.panel_fit
  const crossGrainAxis: 'l' | 'w' = board.grain === 'x' ? 'w' : 'l' // movement runs ⊥ to grain
  const shrinkPct = species?.shrink_tan_pct
  const crossDim = board.dims[crossGrainAxis]
  const movementGap = typeof shrinkPct === 'number' ? crossDim * (shrinkPct / 100) * 0.6 : 0

  const fitted = { l: board.dims.l + 2 * groove_depth, w: board.dims.w + 2 * groove_depth }
  fitted[crossGrainAxis] -= movementGap

  return { ...fitted, movementGap, crossGrainAxis, grooveDepth: groove_depth }
}
