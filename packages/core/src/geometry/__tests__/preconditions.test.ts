import { describe, it, expect } from 'vitest'
import { BoardSchema } from '../../board.js'
import { checkJointPrecondition } from '../preconditions.js'

const board = (id: string, pos: [number, number, number], dims: { l: number; w: number; t: number }) =>
  BoardSchema.parse({
    id,
    name: id,
    dims,
    species: 'spc_red_oak',
    transform: { pos, rot: [0, 0, 0] },
  })

// A "stile" along x and a "rail" whose end overlaps it by `engage` inches.
const stile = board('brd_stile', [0, 0, 0], { l: 30, w: 2.5, t: 0.75 })
const railEngaging = (engage: number) =>
  board('brd_rail', [15 + 9 - engage, 0, 0], { l: 18, w: 2.5, t: 0.75 }) // rail spans [pos-9, pos+9]

describe('checkJointPrecondition — contact gate (all types)', () => {
  it('rejects a joint between boards that do not touch, teaching the gap', () => {
    const farRail = board('brd_rail', [40, 0, 0], { l: 18, w: 2.5, t: 0.75 })
    const res = checkJointPrecondition('butt', stile, farRail)
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/do not touch/)
    expect(res.reason).toMatch(/brd_stile|stile/)
    expect(res.reason).toMatch(/gap of/)
  })

  it('accepts a butt between boards in contact', () => {
    expect(checkJointPrecondition('butt', stile, railEngaging(2)).ok).toBe(true)
  })
})

describe('checkJointPrecondition — mortise_tenon engagement', () => {
  it('rejects engagement below 1/2", naming the measured value', () => {
    const res = checkJointPrecondition('mortise_tenon', stile, railEngaging(0.25))
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/engages/)
    expect(res.reason).toMatch(/0\.25/)
    expect(res.reason).toMatch(/0\.5/)
  })

  it('accepts engagement of at least 1/2"', () => {
    expect(checkJointPrecondition('mortise_tenon', stile, railEngaging(1)).ok).toBe(true)
  })
})

describe('checkJointPrecondition — housing depth', () => {
  it('accepts a shelf seated deeper than t_a/3', () => {
    // shelf overlaps the side fully through its thickness (0.75 ≥ 0.25)
    expect(checkJointPrecondition('housing', stile, railEngaging(4)).ok).toBe(true)
  })

  it('rejects a too-shallow seat with a teaching reason', () => {
    // A wide board barely grazing the side's face: penetration < t_a/3.
    const side = board('brd_side', [0, 0, 0], { l: 30, w: 10, t: 1.5 })
    const shelf = board('brd_shelf', [0, 0, 0.75 + 0.1], { l: 24, w: 10, t: 0.75 }) // overlaps side's top face by 0.05
    const res = checkJointPrecondition('housing', side, shelf, { depth: 0.5 })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/seats only/)
  })
})

describe('checkJointPrecondition — half_lap crossing', () => {
  it('accepts two boards crossing in plan', () => {
    const a = board('brd_a', [0, 0, 0], { l: 20, w: 3, t: 0.75 })
    const b = board('brd_b', [0, 0, 0], { l: 3, w: 20, t: 0.75 }) // crosses a, same z
    expect(checkJointPrecondition('half_lap', a, b).ok).toBe(true)
  })
})
