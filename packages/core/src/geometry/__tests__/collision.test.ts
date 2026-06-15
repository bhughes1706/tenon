import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model } from '../../index.js'
import { recomputeWarnings, narrowphase, COLLISION_VOL_EPS } from '../collision.js'
import type { AABB } from '../aabb.js'

// recomputeWarnings reads only board id/name/dims/transform + joints — loose casts
// keep the fixtures readable. Ported from chunk 8's web/src/lib/collision.test.ts,
// now on the volume epsilon (§6 step 4).
const board = (id: string, pos: [number, number, number], dims = { l: 4, w: 4, t: 4 }): Board =>
  ({ id, name: id, dims, transform: { pos, rot: [0, 0, 0] } }) as unknown as Board

const model = (boards: Board[], joints: Joint[] = []): Model => ({ boards, joints } as unknown as Model)

describe('narrowphase', () => {
  it('flush contact does not count as a collision', () => {
    const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] }
    const b: AABB = { min: [2, 0, 0], max: [4, 2, 2] } // touching at x=2 → 0 volume
    expect(narrowphase(a, b).intersects).toBe(false)
    expect(narrowphase(a, b).volume).toBe(0)
  })

  it('real interpenetration counts', () => {
    const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] }
    const b: AABB = { min: [1, 1, 1], max: [3, 3, 3] }
    const r = narrowphase(a, b)
    expect(r.intersects).toBe(true)
    expect(r.volume).toBeGreaterThan(COLLISION_VOL_EPS)
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
