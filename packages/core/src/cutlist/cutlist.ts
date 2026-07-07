// §7 — `generateCutlist(model, opts) → CutlistResult`. WASM-free (base entry) so the same
// function backs the web panel (live, client-side) and the server REST route / MCP.
//
// Pipeline (§7): finished dims → panel auto-sizing (§3.4, panel.ts) → glue-up strip
// expansion (§3.1) → rough allowances → group identical rows (qty) → board feet (solid) or
// ft² (sheet) rounded up per row → waste factor + species cost in a per-species materials
// summary. Machining notes come from notes.ts, plus panel-fit/glue-up notes added here
// (they need species data from opts, which notes.ts deliberately doesn't take).

import type { Model } from '../model.js'
import type { Warning } from '../common.js'
import { DEFAULT_MAX_STRIP_WIDTH } from '../board.js'
import { machiningNotes } from './notes.js'
import { roughThickness, quarterLabel, LENGTH_ALLOWANCE, WIDTH_ALLOWANCE } from './rough.js'
import { fitPanel } from './panel.js'
import { fmtFraction } from './format.js'

const GLUE_LINE_ALLOWANCE = 1 / 8 // in, per strip (§3.1)

export type CutlistKind = 'solid' | 'sheet'

export interface CutlistDims {
  l: number
  w: number
  t: number
}

export interface CutlistRow {
  qty: number
  finished: CutlistDims
  rough: CutlistDims
  thicknessLabel: string // "4/4", "8/4"; "" for sheets
  species: string // spc_ id
  speciesName: string
  kind: CutlistKind
  boardFeet: number // per ROW (qty incl.), rough dims, rounded up; 0 for sheets
  areaFt2: number // per ROW; 0 for solids
  notes: string[]
  boardIds: string[] // boards merged into this row (selection hook for ch.11)
}

// Per-species purchasing summary (§7.5 waste + species cost).
export interface CutlistMaterial {
  species: string
  speciesName: string
  kind: CutlistKind
  netBoardFeet: number
  netAreaFt2: number
  wasteFactor: number
  grossBoardFeet: number // net × (1 + waste), rounded up; solids
  grossAreaFt2: number // net × (1 + waste); sheets
  sheets: number // gross ft² ÷ sheetAreaFt2, rounded up; sheets
  costPerUnit: number // $/bf (solid) or $/sheet (sheet) — species.cost_bf
  cost: number // material cost incl. waste; 0 if species unknown
}

export interface CutlistResult {
  rows: CutlistRow[]
  materials: CutlistMaterial[]
  totalCost: number
  warnings: Warning[]
}

export interface CutlistSpecies {
  kind: CutlistKind
  cost_bf: number // $/bf for solid, $/sheet for sheet goods (§8)
  common_name: string
  shrink_tan_pct?: number // green→OD tangential, % (§8) — panel movement gap (§3.4); optional, no cost impact
}

export interface CutlistOpts {
  species: Record<string, CutlistSpecies>
  wasteFactorSolid: number // §20.5 waste_factor_solid (default 0.20)
  wasteFactorSheet: number // §20.5 waste_factor_sheet (default 0.10)
  fractionPrecision?: number // note formatting; default 16
  // Sheet goods are priced per sheet, but board dims don't record the parent sheet size.
  // Until species carry a structured sheet size, assume one sheet = this many ft²
  // (32 = a 4×8). Documented approximation; cost is an estimate for sheet rows.
  sheetAreaFt2?: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

export function generateCutlist(model: Model, opts: CutlistOpts): CutlistResult {
  const precision = opts.fractionPrecision ?? 16
  const sheetAreaFt2 = opts.sheetAreaFt2 ?? 32
  const notesByBoard = machiningNotes(model, precision)
  const warnings: Warning[] = []
  const unknownSpecies = new Set<string>()
  const fr = (n: number) => fmtFraction(n, precision)

  // ── 1) group identical boards (finished dims, species, kind, machining-note set) ──
  const groups = new Map<string, CutlistRow>()
  for (const board of model.boards) {
    const spc = opts.species[board.species]
    if (!spc) unknownSpecies.add(board.species)
    const isSheet = board.kind === 'sheet'
    const isPanel = board.kind === 'panel'

    // §3.4 — a floating panel's own dims read as the opening; fit() is a no-op (passes
    // dims through) for every other board, including a non-floating panel.
    const fitted = isPanel ? fitPanel(board, spc) : null
    const notes = [...(notesByBoard.get(board.id) ?? [])]
    if (fitted && board.panel_fit) {
      notes.push(
        `float panel: opening ${fr(board.dims.l)} × ${fr(board.dims.w)}, ` +
          `+2×${fr(fitted.grooveDepth)} groove, −${fr(fitted.movementGap)} movement ` +
          `(⊥ ${fitted.crossGrainAxis === 'w' ? 'width' : 'length'})`,
      )
    }

    // §3.1 — glue_up splits the (fitted) width into N strips, each milled to width/strips
    // plus a per-strip glue-line allowance; without glue_up a wide panel is flagged instead.
    const panelW = fitted?.w ?? board.dims.w
    const panelL = fitted?.l ?? board.dims.l
    let stripQty = 1
    let widthAllowance = WIDTH_ALLOWANCE
    let finishedW = panelW
    if (isPanel && board.glue_up) {
      stripQty = board.glue_up.strips
      finishedW = panelW / stripQty
      widthAllowance = GLUE_LINE_ALLOWANCE + WIDTH_ALLOWANCE
      notes.push(`glue-up: ${stripQty} strips × ${fr(finishedW)} wide, alternate grain orientation`)
    } else if (isPanel && panelW > DEFAULT_MAX_STRIP_WIDTH) {
      warnings.push({
        code: 'WIDE_PANEL_NO_GLUEUP',
        boards: [board.id],
        msg: `${board.name} is ${fr(panelW)} wide with no glue_up set — solid stock this wide is rarely available; add glue_up or confirm the species stocks it.`,
      })
    }

    const finished: CutlistDims = { l: panelL, w: finishedW, t: board.dims.t }
    const rough: CutlistDims = isSheet
      ? { ...finished }
      : {
          l: finished.l + LENGTH_ALLOWANCE,
          w: finished.w + widthAllowance,
          t: roughThickness(finished.t),
        }
    const key = [
      board.species,
      board.kind,
      round4(finished.l),
      round4(finished.w),
      round4(finished.t),
      notes.join('|'),
    ].join('~')

    let row = groups.get(key)
    if (!row) {
      row = {
        qty: 0,
        finished,
        rough,
        thicknessLabel: isSheet ? '' : quarterLabel(rough.t),
        species: board.species,
        speciesName: spc?.common_name ?? board.species,
        kind: isSheet ? 'sheet' : 'solid',
        boardFeet: 0,
        areaFt2: 0,
        notes,
        boardIds: [],
      }
      groups.set(key, row)
    }
    row.qty += board.qty * stripQty // §3.1: qty multiplies, glue-up strips multiply again
    row.boardIds.push(board.id)
  }

  // ── 2) board feet (solid) / ft² (sheet), rounded up per row (§7.4) ──
  const rows = [...groups.values()]
  for (const row of rows) {
    if (row.kind === 'sheet') {
      row.areaFt2 = round2(((row.rough.l * row.rough.w) / 144) * row.qty)
    } else {
      row.boardFeet = Math.ceil(((row.rough.t * row.rough.w * row.rough.l) / 144) * row.qty)
    }
  }
  rows.sort(
    (x, y) =>
      x.speciesName.localeCompare(y.speciesName) ||
      y.boardFeet - x.boardFeet ||
      y.areaFt2 - x.areaFt2,
  )

  // ── 3) per-species materials summary: waste factor + cost (§7.5) ──
  const matMap = new Map<string, CutlistMaterial>()
  for (const row of rows) {
    let m = matMap.get(row.species)
    if (!m) {
      m = {
        species: row.species,
        speciesName: row.speciesName,
        kind: row.kind,
        netBoardFeet: 0,
        netAreaFt2: 0,
        wasteFactor: 0,
        grossBoardFeet: 0,
        grossAreaFt2: 0,
        sheets: 0,
        costPerUnit: 0,
        cost: 0,
      }
      matMap.set(row.species, m)
    }
    m.netBoardFeet += row.boardFeet
    m.netAreaFt2 += row.areaFt2
  }
  for (const m of matMap.values()) {
    const spc = opts.species[m.species]
    m.costPerUnit = spc?.cost_bf ?? 0
    if (m.kind === 'sheet') {
      m.wasteFactor = opts.wasteFactorSheet
      m.grossAreaFt2 = round2(m.netAreaFt2 * (1 + m.wasteFactor))
      m.sheets = Math.ceil(m.grossAreaFt2 / sheetAreaFt2)
      m.cost = round2(m.sheets * m.costPerUnit)
    } else {
      m.wasteFactor = opts.wasteFactorSolid
      m.grossBoardFeet = Math.ceil(m.netBoardFeet * (1 + m.wasteFactor))
      m.cost = round2(m.grossBoardFeet * m.costPerUnit)
    }
  }
  const materials = [...matMap.values()].sort((x, y) => x.speciesName.localeCompare(y.speciesName))
  const totalCost = round2(materials.reduce((s, m) => s + m.cost, 0))

  for (const id of unknownSpecies) {
    warnings.push({
      code: 'UNKNOWN_SPECIES',
      boards: model.boards.filter((b) => b.species === id).map((b) => b.id),
      msg: `Species ${id} not found — its rows have no cost.`,
    })
  }

  return { rows, materials, totalCost, warnings }
}
