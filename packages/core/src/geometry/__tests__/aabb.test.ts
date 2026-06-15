import { describe, it, expect } from 'vitest'
import { BoardSchema } from '../../board.js'
import {
  worldAABB,
  worldOBB,
  overlapRegion,
  intersectVolume,
  isAxisAligned,
  eulerXYZToMat3,
  applyMat3,
  type AABB,
} from '../aabb.js'

const board = (over: Record<string, unknown>) =>
  BoardSchema.parse({
    id: 'brd_AAAAAAAAAA',
    name: 'b',
    dims: { l: 10, w: 2, t: 1 },
    species: 'spc_red_oak',
    transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
    ...over,
  })

describe('eulerXYZToMat3', () => {
  it('rotates +90° about Z mapping local +x → world +y (matches three.js XYZ)', () => {
    const m = eulerXYZToMat3(0, 0, 90)
    const v = applyMat3(m, [1, 0, 0])
    expect(v[0]).toBeCloseTo(0, 6)
    expect(v[1]).toBeCloseTo(1, 6)
    expect(v[2]).toBeCloseTo(0, 6)
  })
})

describe('worldAABB', () => {
  it('is exact for an axis-aligned board', () => {
    const box = worldAABB(board({}))
    expect(box.min).toEqual([-5, -1, -0.5])
    expect(box.max).toEqual([5, 1, 0.5])
  })

  it('is exact for a 90°-rotated board (length axis swaps to Z)', () => {
    const box = worldAABB(board({ transform: { pos: [0, 0, 0], rot: [0, 90, 0] } }))
    // rot Y 90° swaps length(x) and thickness(z): x half → 0.5, z half → 5
    expect(box.max[0]).toBeCloseTo(0.5, 4)
    expect(box.max[1]).toBeCloseTo(1, 4)
    expect(box.max[2]).toBeCloseTo(5, 4)
  })

  it('translates with the board position', () => {
    const box = worldAABB(board({ transform: { pos: [3, 4, 5], rot: [0, 0, 0] } }))
    expect(box.min).toEqual([-2, 3, 4.5])
    expect(box.max).toEqual([8, 5, 5.5])
  })
})

describe('worldOBB', () => {
  it('carries world axes that coincide with the AABB for a 90° board', () => {
    const obb = worldOBB(board({}))
    expect(obb.halfExtents).toEqual([5, 1, 0.5])
    expect(obb.axes[0].map((n) => Math.round(n))).toEqual([1, 0, 0])
  })
})

describe('isAxisAligned', () => {
  it('is true for multiples of 90', () => {
    expect(isAxisAligned(board({ transform: { pos: [0, 0, 0], rot: [90, 180, -90] } }))).toBe(true)
  })
  it('is false for an off-axis rotation', () => {
    expect(isAxisAligned(board({ transform: { pos: [0, 0, 0], rot: [0, 30, 0] } }))).toBe(false)
  })
})

describe('intersectVolume / overlapRegion', () => {
  const a: AABB = { min: [0, 0, 0], max: [2, 2, 2] }
  it('computes the intersection volume of two overlapping boxes', () => {
    const b: AABB = { min: [1, 1, 1], max: [3, 3, 3] }
    expect(intersectVolume(a, b)).toBeCloseTo(1, 9)
  })
  it('returns 0 volume for a gap', () => {
    const b: AABB = { min: [3, 0, 0], max: [4, 2, 2] }
    expect(intersectVolume(a, b)).toBe(0)
  })
  it('overlapRegion is null on a true gap', () => {
    expect(overlapRegion(a, { min: [3, 0, 0], max: [4, 2, 2] })).toBeNull()
  })
  it('overlapRegion is a degenerate box for flush contact', () => {
    const region = overlapRegion(a, { min: [2, 0, 0], max: [4, 2, 2] })
    expect(region).not.toBeNull()
    expect(region!.min[0]).toBe(2)
    expect(region!.max[0]).toBe(2) // zero-extent on the contact axis
  })
})
