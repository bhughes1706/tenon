import { describe, it, expect } from 'vitest'
import { BoardSchema, type Board } from '@tenon/core'
import { computeExplodeOffsets, EXPLODE_GAIN } from '../explode.js'

function board(id: string, pos: [number, number, number], dims = { l: 4, w: 4, t: 1 }): Board {
  return BoardSchema.parse({
    id,
    name: id,
    dims,
    species: 'spc_red_oak',
    transform: { pos, rot: [0, 0, 0] },
  })
}

function model(...boards: Board[]) {
  return { id: 'mdl_x', rev: 0, name: 'm', boards, joints: [], groups: [], meta: {} } as never
}

describe('computeExplodeOffsets', () => {
  it('returns no offsets when there is nothing to explode', () => {
    expect(computeExplodeOffsets(null, 1).size).toBe(0)
    expect(computeExplodeOffsets(model(board('brd_solo', [0, 0, 0])), 1).size).toBe(0) // single board
    const two = model(board('brd_l', [-10, 0, 0]), board('brd_r', [10, 0, 0]))
    expect(computeExplodeOffsets(two, 0).size).toBe(0) // factor 0
  })

  it('pushes opposite boards apart along their dominant axis with equal magnitude', () => {
    const m = model(board('brd_l', [-10, 0, 0]), board('brd_r', [10, 0, 0]))
    const off = computeExplodeOffsets(m, 1)
    const left = off.get('brd_l')!
    const right = off.get('brd_r')!
    expect(left[0]).toBeLessThan(0)
    expect(right[0]).toBeGreaterThan(0)
    expect(left[0]).toBeCloseTo(-right[0]) // symmetric
    expect(left[1]).toBe(0) // axis-snapped: no off-axis drift
    expect(left[2]).toBe(0)
  })

  it('leaves a board sitting on the centroid in place', () => {
    const m = model(board('brd_l', [-10, 0, 0]), board('brd_mid', [0, 0, 0]), board('brd_r', [10, 0, 0]))
    expect(computeExplodeOffsets(m, 1).get('brd_mid')!).toEqual([0, 0, 0])
  })

  it('snaps a mostly-Y board to pure +Y motion', () => {
    // off-centre a little in x, a lot in y → dominant axis is y.
    const m = model(board('brd_top', [1, 12, 0]), board('brd_bot', [-1, -12, 0]))
    const top = computeExplodeOffsets(m, 1).get('brd_top')!
    expect(top[0]).toBe(0)
    expect(top[1]).toBeGreaterThan(0)
    expect(top[2]).toBe(0)
  })

  it('scales magnitude monotonically with the factor', () => {
    const m = model(board('brd_l', [-10, 0, 0]), board('brd_r', [10, 0, 0]))
    const half = Math.abs(computeExplodeOffsets(m, 0.5).get('brd_l')![0])
    const full = Math.abs(computeExplodeOffsets(m, 1).get('brd_l')![0])
    expect(half).toBeGreaterThan(0)
    expect(full).toBeCloseTo(2 * half)
    expect(full).toBeGreaterThan(EXPLODE_GAIN) // sanity: scales with radius
  })
})
