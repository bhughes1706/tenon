import { describe, it, expect } from 'vitest'
import { solveSnap, type AABB, type SnapInput } from './snapping.js'

// A cube AABB centered at (cx,cy,cz) with half-extent h.
const cube = (cx: number, cy: number, cz: number, h = 0.5): AABB => ({
  min: [cx - h, cy - h, cz - h],
  max: [cx + h, cy + h, cz + h],
})

const base = (over: Partial<SnapInput>): SnapInput => ({
  center: [0, 0, 0],
  half: [0.5, 0.5, 0.5],
  others: [],
  grid: 0,
  threshold: 0.25,
  magnetic: true,
  ...over,
})

describe('solveSnap — magnetism', () => {
  it('snaps a face flush to a neighbor (dragged.max → other.min)', () => {
    // Other cube min face at x=1.5. Dragged max face at x=1.4 → pull center to 1.0.
    const r = solveSnap(base({ center: [0.9, 0, 0], others: [cube(2, 0, 0)] }))
    expect(r.pos[0]).toBeCloseTo(1.0, 6)
    expect(r.guides.length).toBeGreaterThanOrEqual(1)
  })

  it('snaps center-to-center when nearly aligned', () => {
    const r = solveSnap(base({ center: [0, 0, 0], others: [cube(0.08, 0, 0)] }))
    expect(r.pos[0]).toBeCloseTo(0.08, 6)
  })

  it('does nothing when outside the threshold (no grid)', () => {
    const r = solveSnap(base({ center: [0.9, 0, 0], others: [cube(5, 0, 0)] }))
    expect(r.pos[0]).toBeCloseTo(0.9, 6)
    expect(r.guides).toHaveLength(0)
  })

  it('gates on perpendicular proximity — ignores a far-off-axis board', () => {
    // Aligned on x but 10" away on z → must NOT snap on any axis.
    const r = solveSnap(base({ center: [0.9, 0, 0], others: [cube(2, 0, 10)] }))
    expect(r.pos[0]).toBeCloseTo(0.9, 6)
    expect(r.guides).toHaveLength(0)
  })

  it('snaps each axis independently (corner alignment)', () => {
    const r = solveSnap(base({ center: [0.9, 0, 0.9], others: [cube(2, 0, 2)] }))
    expect(r.pos[0]).toBeCloseTo(1.0, 6)
    expect(r.pos[2]).toBeCloseTo(1.0, 6)
    expect(r.guides.length).toBeGreaterThanOrEqual(2)
  })
})

describe('solveSnap — grid fallback & suspend', () => {
  it('falls back to grid when no magnetic target', () => {
    const r = solveSnap(base({ center: [0.27, 0, 0], others: [], grid: 0.25 }))
    expect(r.pos[0]).toBeCloseTo(0.25, 6)
  })

  it('magnetism beats grid within threshold (lands off-grid)', () => {
    // Other min face at 1.33 (off-grid). Magnetic flush → center 0.83; grid → 1.0.
    const r = solveSnap(base({ center: [0.9, 0, 0], others: [cube(1.83, 0, 0)], grid: 0.25 }))
    expect(r.pos[0]).toBeCloseTo(0.83, 6)
  })

  it('suspends magnetism when magnetic=false (grid only)', () => {
    const r = solveSnap(base({ center: [0.9, 0, 0], others: [cube(2, 0, 0)], grid: 0.25, magnetic: false }))
    expect(r.pos[0]).toBeCloseTo(1.0, 6) // 0.9 grid-snaps to 1.0, ignores the face
    expect(r.guides).toHaveLength(0)
  })

  it('leaves position untouched with no grid and magnetism suspended', () => {
    const r = solveSnap(base({ center: [0.37, 1.1, 2.2], grid: 0, magnetic: false }))
    expect(r.pos).toEqual([0.37, 1.1, 2.2])
  })
})
