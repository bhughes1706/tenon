import { describe, it, expect } from 'vitest'
import type { CutlistResult } from '@tenon/core'
import { buildCutlistOpts, cutlistToCsv, cutlistToHtml } from './cutlist.js'
import type { Species } from './speciesApi.js'
import type { Settings } from './api.js'

const SPECIES: Species[] = [
  { id: 'spc_red_oak', common_name: 'Red Oak', botanical: 'Quercus rubra', kind: 'solid', cost_bf: 5.5, thicknesses: ['4/4'] },
  { id: 'spc_bb_ply_34', common_name: 'Baltic Birch Ply 3/4"', botanical: null, kind: 'sheet', cost_bf: 70, thicknesses: ['3/4'] },
]

describe('buildCutlistOpts', () => {
  it('maps the species list into a cost/kind lookup', () => {
    const opts = buildCutlistOpts(SPECIES, null)
    expect(opts.species.spc_red_oak).toEqual({ kind: 'solid', cost_bf: 5.5, common_name: 'Red Oak' })
    expect(opts.species.spc_bb_ply_34.kind).toBe('sheet')
  })

  it('uses settings waste factors and precision when present, defaults otherwise', () => {
    expect(buildCutlistOpts([], null)).toMatchObject({ wasteFactorSolid: 0.2, wasteFactorSheet: 0.1, fractionPrecision: 16 })
    const s = { waste_factor_solid: 0.3, waste_factor_sheet: 0.05, fraction_precision: 32 } as Settings
    expect(buildCutlistOpts([], s)).toMatchObject({ wasteFactorSolid: 0.3, wasteFactorSheet: 0.05, fractionPrecision: 32 })
  })
})

const RESULT: CutlistResult = {
  rows: [
    {
      qty: 4,
      finished: { l: 24, w: 3, t: 0.75 },
      rough: { l: 25, w: 3.25, t: 1 },
      thicknessLabel: '4/4',
      species: 'spc_red_oak',
      speciesName: 'Red Oak',
      kind: 'solid',
      boardFeet: 3,
      areaFt2: 0,
      notes: ['tenon 1/4 × 2-1/4 × 1-1/2'],
      boardIds: ['brd_1', 'brd_2', 'brd_3', 'brd_4'],
    },
    {
      qty: 1,
      finished: { l: 48, w: 24, t: 0.75 },
      rough: { l: 48, w: 24, t: 0.75 },
      thicknessLabel: '',
      species: 'spc_bb_ply_34',
      speciesName: 'Baltic Birch Ply 3/4"',
      kind: 'sheet',
      boardFeet: 0,
      areaFt2: 8,
      notes: [],
      boardIds: ['brd_5'],
    },
  ],
  materials: [
    { species: 'spc_red_oak', speciesName: 'Red Oak', kind: 'solid', netBoardFeet: 3, netAreaFt2: 0, wasteFactor: 0.2, grossBoardFeet: 4, grossAreaFt2: 0, sheets: 0, costPerUnit: 5.5, cost: 22 },
    { species: 'spc_bb_ply_34', speciesName: 'Baltic Birch Ply 3/4"', kind: 'sheet', netBoardFeet: 0, netAreaFt2: 8, wasteFactor: 0.1, grossBoardFeet: 0, grossAreaFt2: 8.8, sheets: 1, costPerUnit: 70, cost: 70 },
  ],
  totalCost: 92,
  warnings: [],
}

describe('cutlistToCsv', () => {
  const csv = cutlistToCsv(RESULT)
  const lines = csv.split('\n')

  it('has a header and one line per row', () => {
    expect(lines[0]).toBe('Qty,Finished (L×W×T),Rough (L×W×T),Stock,Species,Bd.Ft,Area ft²,Notes')
    expect(lines[1]).toContain('4,24 × 3 × 3/4,25 × 3-1/4 × 1,4/4,Red Oak,3,,tenon 1/4 × 2-1/4 × 1-1/2')
  })

  it('renders sheets with ft², no board feet, and CSV-escapes the inch-mark in the name', () => {
    // The name contains a literal " (inch mark), so the field is quoted and the " doubled.
    expect(lines[2]).toContain('—,sheet,"Baltic Birch Ply 3/4""",,8,')
  })

  it('includes a materials block and the total', () => {
    expect(csv).toContain('Species,Net,Waste,Purchase,Unit cost,Cost')
    expect(csv).toContain('Red Oak,3 bf,20%,4 bf,$5.5/bf,$22.00')
    expect(csv).toContain('Total,,,,,$92.00')
  })
})

describe('cutlistToHtml', () => {
  it('produces an HTML document with the model name and total', () => {
    const html = cutlistToHtml(RESULT, 'Bookcase')
    expect(html).toContain('<title>Cut list — Bookcase</title>')
    expect(html).toContain('$92.00')
    expect(html).toContain('Red Oak')
  })

  it('escapes HTML-special characters in names', () => {
    const html = cutlistToHtml(RESULT, 'A & B <test>')
    expect(html).toContain('A &amp; B &lt;test&gt;')
  })
})
