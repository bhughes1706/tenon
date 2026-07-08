import { describe, it, expect } from 'vitest'
import { pickArris } from './arrisPick.js'
import type { BoardDims } from '@tenon/core'

// A 10 (l) × 4 (w) × 0.75 (t) board, centred at the origin in its local frame.
const dims: BoardDims = { l: 10, w: 4, t: 0.75 }

describe('pickArris', () => {
  it('picks the face from the thickness (z) sign', () => {
    expect(pickArris([0, 1.9, 0.3], dims).face).toBe('front')
    expect(pickArris([0, 1.9, -0.3], dims).face).toBe('back')
  })

  it('picks the nearest of the four side edges', () => {
    expect(pickArris([0, 1.9, 0.3], dims).edge).toBe('top') // near +y
    expect(pickArris([0, -1.9, 0.3], dims).edge).toBe('bottom') // near −y
    expect(pickArris([4.9, 0, 0.3], dims).edge).toBe('right') // near +x
    expect(pickArris([-4.9, 0, 0.3], dims).edge).toBe('left') // near −x
  })

  it('resolves each of the 8 arrises', () => {
    const cases: [[number, number, number], string][] = [
      [[0, 1.9, 0.3], 'top/front'],
      [[0, 1.9, -0.3], 'top/back'],
      [[0, -1.9, 0.3], 'bottom/front'],
      [[0, -1.9, -0.3], 'bottom/back'],
      [[4.9, 0, 0.3], 'right/front'],
      [[4.9, 0, -0.3], 'right/back'],
      [[-4.9, 0, 0.3], 'left/front'],
      [[-4.9, 0, -0.3], 'left/back'],
    ]
    for (const [p, expected] of cases) {
      const a = pickArris(p, dims)
      expect(`${a.edge}/${a.face}`).toBe(expected)
    }
  })

  it('near a corner, the closer side edge wins (midline tie-break)', () => {
    // Point closer to the +x (right) edge than the +y (top) edge: dx = 5-4.6 = 0.4 <
    // dy = 2-1.5 = 0.5 → right.
    expect(pickArris([4.6, 1.5, 0.3], dims).edge).toBe('right')
    // Nudge it nearer the top edge instead → top.
    expect(pickArris([4.4, 1.9, 0.3], dims).edge).toBe('top')
  })
})
