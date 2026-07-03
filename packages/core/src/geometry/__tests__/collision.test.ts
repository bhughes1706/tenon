import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model } from '../../index.js'
import { recomputeWarnings, narrowphase, COLLISION_VOL_EPS } from '../collision.js'

// recomputeWarnings reads only board id/name/dims/transform + joints — loose casts
// keep the fixtures readable. Ported from chunk 8's web/src/lib/collision.test.ts,
// now on the volume epsilon (§6 step 4).
const board = (id: string, pos: [number, number, number], dims = { l: 4, w: 4, t: 4 }, rot: [number, number, number] = [0, 0, 0]): Board =>
  ({ id, name: id, dims, transform: { pos, rot } }) as unknown as Board

const model = (boards: Board[], joints: Joint[] = []): Model => ({ boards, joints } as unknown as Model)

describe('narrowphase', () => {
  it('flush contact does not count as a collision', () => {
    const a = board('a', [1, 1, 1], { l: 2, w: 2, t: 2 })
    const b = board('b', [3, 1, 1], { l: 2, w: 2, t: 2 }) // touching at x=2 → 0 volume
    expect(narrowphase(a, b).intersects).toBe(false)
    expect(narrowphase(a, b).volume).toBe(0)
  })

  it('real interpenetration counts (axis-aligned fast path)', () => {
    const a = board('a', [1, 1, 1], { l: 2, w: 2, t: 2 })
    const b = board('b', [2, 2, 2], { l: 2, w: 2, t: 2 })
    const r = narrowphase(a, b)
    expect(r.intersects).toBe(true)
    expect(r.volume).toBeGreaterThan(COLLISION_VOL_EPS)
  })

  it('exact OBB-SAT: a 45°-rotated board overlapping a square neighbour is detected', () => {
    // b (half-extent 1, rotated 45° about Z) sits with its vertex poking along +X into
    // a (half-extent 2 at origin) — a real, if thin, penetration (Monte-Carlo verified).
    const a = board('a', [0, 0, 0], { l: 4, w: 4, t: 4 })
    const b = board('b', [3.3, 0, 0], { l: 2, w: 2, t: 2 }, [0, 0, 45])
    expect(narrowphase(a, b).intersects).toBe(true)
  })

  it('exact OBB-SAT: a diamond-rotated board that only overlaps in AABB, not in truth, is NOT flagged', () => {
    // b's AABB (half-extent 1.414 after the 45° rotation) reaches to x=y≈1.49, which
    // DOES overlap a's [-2,2] corner region — but b's true diamond footprint (edge, not
    // vertex, faces this diagonal direction) clears a's corner (Monte-Carlo verified:
    // 0/500000 sample hits). This is exactly the false positive an AABB-only check
    // would produce; OBB-SAT must not flag it.
    const a = board('a', [0, 0, 0], { l: 4, w: 4, t: 4 })
    const b = board('b', [2.9, 2.9, 0], { l: 2, w: 2, t: 2 }, [0, 0, 45])
    expect(narrowphase(a, b).intersects).toBe(false)
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

  // Persistent joint-precondition lint (§2.4 #3): recomputeWarnings re-derives every
  // enabled joint's "requires" row on every call, so the warning survives edits that
  // don't touch the joint (validateOps no longer soft-warns transiently).
  it('flags an enabled joint whose boards have been moved apart', () => {
    const j = { id: 'jnt_1', a: 'brd_a', b: 'brd_b', type: 'butt', enabled: true, params: {} } as unknown as Joint
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [40, 0, 0])], [j]))
    expect(w.map((x) => x.code)).toContain('JOINT_PRECONDITION_FAILED')
    expect(w.find((x) => x.code === 'JOINT_PRECONDITION_FAILED')!.joints).toEqual(['jnt_1'])
  })

  it('flags an enabled joint whose boards were rotated to a compound angle', () => {
    const j = { id: 'jnt_1', a: 'brd_a', b: 'brd_b', type: 'half_lap', enabled: true, params: {} } as unknown as Joint
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [2, 0, 0], undefined, [0, 45, 0])], [j]))
    const pre = w.find((x) => x.code === 'JOINT_PRECONDITION_FAILED')
    expect(pre).toBeDefined()
    expect(pre!.msg).toMatch(/square|compound/)
  })

  it('does not flag a disabled joint or a healthy one', () => {
    const healthy = { id: 'jnt_1', a: 'brd_a', b: 'brd_b', type: 'butt', enabled: true, params: {} } as unknown as Joint
    const disabled = { id: 'jnt_2', a: 'brd_a', b: 'brd_b', type: 'butt', enabled: false, params: {} } as unknown as Joint
    // touching flush → butt precondition satisfied; the disabled joint is skipped entirely
    const w = recomputeWarnings(model([board('brd_a', [0, 0, 0]), board('brd_b', [4, 0, 0])], [healthy, disabled]))
    expect(w.filter((x) => x.code === 'JOINT_PRECONDITION_FAILED')).toHaveLength(0)
  })
})
