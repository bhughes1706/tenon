import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model } from '../../index.js'
import { generateCutlist, roughThickness, type CutlistOpts } from '../index.js'

const board = (over: Partial<Board> & { id: string }): Board =>
  ({
    name: over.id,
    kind: 'board',
    dims: { l: 24, w: 3, t: 0.75 },
    species: 'spc_red_oak',
    grain: 'x',
    transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
    qty: 1,
    tags: [],
    locked: false,
    glue_up: null,
    edge_grooves: [],
    ...over,
  }) as Board

const joint = (type: string, a: string, b: string, params: Record<string, unknown> = {}): Joint =>
  ({ id: `jnt_${type}`, type, a, b, enabled: true, params }) as unknown as Joint

const model = (boards: Board[], joints: Joint[] = []): Model => ({ boards, joints } as unknown as Model)

const OPTS: CutlistOpts = {
  species: {
    spc_red_oak: { kind: 'solid', cost_bf: 5.5, common_name: 'Red Oak' },
    spc_walnut: { kind: 'solid', cost_bf: 12, common_name: 'Walnut' },
    spc_bb_ply_34: { kind: 'sheet', cost_bf: 70, common_name: 'Baltic Birch Ply 3/4"' },
  },
  wasteFactorSolid: 0.2,
  wasteFactorSheet: 0.1,
}

describe('roughThickness (§7.2 thresholds)', () => {
  it('rounds up to the next standard quarter', () => {
    expect(roughThickness(0.75)).toBe(1.0) // 4/4
    expect(roughThickness(13 / 16)).toBe(1.0) // boundary inclusive
    expect(roughThickness(0.82)).toBe(1.25) // 5/4
    expect(roughThickness(1.0)).toBe(1.25)
    expect(roughThickness(1 + 1 / 16)).toBe(1.25)
    expect(roughThickness(1.1)).toBe(1.5) // 6/4
    expect(roughThickness(1.32)).toBe(2.0) // 8/4
    expect(roughThickness(1.82)).toBe(3.0) // 12/4
    expect(roughThickness(2.5)).toBe(3.0)
  })
})

describe('generateCutlist', () => {
  it('computes rough dims and board feet for a single solid board (rounded up per row)', () => {
    const r = generateCutlist(model([board({ id: 'brd_1' })]), OPTS)
    expect(r.rows).toHaveLength(1)
    const row = r.rows[0]
    expect(row.rough).toEqual({ l: 25, w: 3.25, t: 1.0 }) // +1", +1/4", 4/4
    expect(row.thicknessLabel).toBe('4/4')
    // (1.0 × 3.25 × 25)/144 = 0.564 → ceil = 1 bf
    expect(row.boardFeet).toBe(1)
    expect(row.areaFt2).toBe(0)
  })

  it('merges identical boards and multiplies qty', () => {
    const r = generateCutlist(
      model([board({ id: 'brd_1' }), board({ id: 'brd_2' }), board({ id: 'brd_3', qty: 2 })]),
      OPTS,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].qty).toBe(4)
    expect(r.rows[0].boardIds).toEqual(['brd_1', 'brd_2', 'brd_3'])
    // 0.564 × 4 = 2.257 → ceil = 3 bf
    expect(r.rows[0].boardFeet).toBe(3)
  })

  it('does not merge rows with different species or machining notes', () => {
    const a = board({ id: 'brd_a' })
    const b = board({ id: 'brd_b', species: 'spc_walnut' })
    const c = board({ id: 'brd_c' }) // identical to a, but will get a dado note
    const d = board({ id: 'brd_d', dims: { l: 24, w: 3, t: 0.5 } })
    const m = model([a, b, c, d], [joint('housing', 'brd_c', 'brd_d')])
    const r = generateCutlist(m, OPTS)
    // a alone; b (walnut); c (has dado note); d (different thickness + receives the shelf)
    expect(r.rows).toHaveLength(4)
    const withNote = r.rows.find((row) => row.notes.length > 0)
    expect(withNote?.boardIds).toEqual(['brd_c'])
  })

  it('per-species materials summary applies waste factor and species cost', () => {
    const m = model([board({ id: 'brd_1' }), board({ id: 'brd_2', species: 'spc_walnut' })])
    const r = generateCutlist(m, OPTS)
    const oak = r.materials.find((x) => x.species === 'spc_red_oak')!
    expect(oak.netBoardFeet).toBe(1)
    expect(oak.wasteFactor).toBe(0.2)
    expect(oak.grossBoardFeet).toBe(2) // ceil(1 × 1.2)
    expect(oak.cost).toBe(11) // 2 × 5.50
    const walnut = r.materials.find((x) => x.species === 'spc_walnut')!
    expect(walnut.cost).toBe(24) // 2 × 12
    expect(r.totalCost).toBe(35)
  })

  it('sheet goods use ft² and per-sheet cost', () => {
    const sheet = board({
      id: 'brd_s',
      kind: 'sheet',
      species: 'spc_bb_ply_34',
      dims: { l: 48, w: 24, t: 0.75 },
      qty: 2,
    })
    const r = generateCutlist(model([sheet]), OPTS)
    const row = r.rows[0]
    expect(row.kind).toBe('sheet')
    expect(row.areaFt2).toBe(16) // (48×24)/144 = 8 ft² × 2
    expect(row.boardFeet).toBe(0)
    const mat = r.materials[0]
    expect(mat.grossAreaFt2).toBe(17.6) // 16 × 1.1
    expect(mat.sheets).toBe(1) // ceil(17.6 / 32)
    expect(mat.cost).toBe(70)
  })

  it('flags unknown species with a warning and zero cost', () => {
    const m = model([board({ id: 'brd_x', species: 'spc_unobtanium' })])
    const r = generateCutlist(m, OPTS)
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_SPECIES')).toBe(true)
    expect(r.materials[0].cost).toBe(0)
    expect(r.rows[0].speciesName).toBe('spc_unobtanium') // falls back to the id
  })

  it('surfaces machining notes on the row (M&T)', () => {
    const stile = board({ id: 'brd_a', dims: { l: 30, w: 2, t: 1.5 } })
    const rail = board({ id: 'brd_b', dims: { l: 20, w: 3, t: 0.75 } })
    const r = generateCutlist(model([stile, rail], [joint('mortise_tenon', 'brd_a', 'brd_b')]), OPTS)
    const railRow = r.rows.find((row) => row.boardIds.includes('brd_b'))!
    expect(railRow.notes).toEqual(['tenon 1/4 × 2-1/4 × 1-1/2'])
  })
})
