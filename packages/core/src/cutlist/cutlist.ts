// §7 — `generateCutlist(model, opts) → CutlistResult`. WASM-free (base entry) so the same
// function backs the web panel (live, client-side) and the server REST route / MCP.
//
// Pipeline (§7): finished dims → rough allowances → group identical rows (qty) → board feet
// (solid) or ft² (sheet) rounded up per row → waste factor + species cost in a per-species
// materials summary. Machining notes come from notes.ts. DEFERRED (chunk 15, by scope):
// glue-up strip math and panel movement auto-sizing — a `panel` board is treated as one
// solid board here.

import type { Model } from '../model.js'
import type { Warning } from '../common.js'
import { machiningNotes } from './notes.js'
import { roughThickness, quarterLabel, LENGTH_ALLOWANCE, WIDTH_ALLOWANCE } from './rough.js'

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

  // ── 1) group identical boards (finished dims, species, kind, machining-note set) ──
  const groups = new Map<string, CutlistRow>()
  for (const board of model.boards) {
    const spc = opts.species[board.species]
    if (!spc) unknownSpecies.add(board.species)
    const isSheet = board.kind === 'sheet'
    const finished: CutlistDims = { l: board.dims.l, w: board.dims.w, t: board.dims.t }
    const rough: CutlistDims = isSheet
      ? { ...finished }
      : {
          l: finished.l + LENGTH_ALLOWANCE,
          w: finished.w + WIDTH_ALLOWANCE,
          t: roughThickness(finished.t),
        }
    const notes = notesByBoard.get(board.id) ?? []
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
    row.qty += board.qty // §3.1 note: qty multiplies in the cut list
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
