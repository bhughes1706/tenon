import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model } from '@tenon/core'
import { recomputeWarnings, worldAABB, penetrates } from './collision.js'
import type { AABB } from '../viewport/snapping.js'

// recomputeWarnings only reads board id/name/dims/transform and joints — a loose
// cast keeps fixtures readable.
const board = (id: string, pos: [number, number, number], dims = { l: 4, w: 4, t: 4 }): Board =>
  ({ id, name: id, dims, transform: { pos, rot: [0, 0, 0] } }) as unknown as Board

const model = (boards: Board[], joints: Joint[] = []): Model =>
  ({ boards, joints } as unknown as Model)

describe('worldAABB', () => {
  it('is exact for a 90°-rotated board (length axis swaps)', () => {
    const b = { id: 'brd_x', name: 'r', dims: { l: 10, w: 2, t: 1 }, transform: { pos: [0, 0, 0], rot: [0, 90, 0] } } as unknown as Board
    const box = worldAABB(b)
    // rot Y 90° swaps length(x) and thickness(z): x half → 0.5, z half → 5
    expect(box.max[0]).toBeCloseTo(0.5, 4)
    expect(box.max[2]).toBeCloseTo(5, 4)
    expect(box.max[1]).toBeCloseTo(1, 4)
  })
})

describe('penetrates', () => {
  it('flush contact does not count (zero overlap on one axis)', () => {
    const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] }
    const b: AABB = { min: [2, 0, 0], max: [4, 2, 2] } // touching at x=2
    expect(penetrates(a, b)).toBe(false)
  })

  it('real interpenetration counts', () => {
    const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] }
    const b: AABB = { min: [1, 1, 1], max: [3, 3, 3] }
    expect(penetrates(a, b)).toBe(true)
  })
})

describe('recomputeWarnings', () => {
  it('flags overlapping boards with no joint', () => {
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [2, 0, 0])]))
    expect(w).toHaveLength(1)
    expect(w[0].code).toBe('UNRESOLVED_COLLISION')
    expect(w[0].boards).toEqual(['brd_a', 'brd_b'])
  })

  it('does not flag boards that merely touch flush', () => {
    // 4" cubes centered 4" apart → faces meet exactly, zero penetration.
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [4, 0, 0])]))
    expect(w).toHaveLength(0)
  })

  it('skips a pair governed by an enabled joint', () => {
    const j = { id: 'jnt_1', a: 'brd_a', b: 'brd_b', type: 'butt', enabled: true } as unknown as Joint
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [2, 0, 0])], [j]))
    expect(w).toHaveLength(0)
  })

  it('still flags a pair whose joint is disabled', () => {
    const j = { id: 'jnt_1', a: 'brd_a', b: 'brd_b', type: 'butt', enabled: false } as unknown as Joint
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [2, 0, 0])], [j]))
    expect(w).toHaveLength(1)
  })

  it('returns [] for a model with fewer than two boards', () => {
    expect(recomputeWarnings(model([board('brd_a', [0, 0, 0])]))).toHaveLength(0)
    expect(recomputeWarnings(null)).toHaveLength(0)
  })
})
