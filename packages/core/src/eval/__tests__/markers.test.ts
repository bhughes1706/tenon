// Chunk 12 ghost markers (docs/chunk12-design.md §4): drawbore pins are render-only —
// jointMarkers() derives world-space cylinders from the same M&T layout as the carve.
// Pure math, no Manifold: these tests never boot WASM.
import { describe, it, expect } from 'vitest'
import { jointMarkers } from '../markers.js'
import { board, jointModel } from './fixtures.js'

// Canonical through M&T: a (4×4×1.5) at the origin unrotated, so pair frame = world.
// eAxis = z, tAxis = x, wAxis = y; entry face at z = +0.75, pin setback = 1.5 × 3/8.
const stile = () => board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] })
const rail = () => board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] })

describe('jointMarkers — drawbore ghost pins', () => {
  it('one pin per tenon, set back 1.5 × dia from the entry face', () => {
    const m = jointMarkers(jointModel(stile(), rail(), 'mortise_tenon', { drawbore: true }))
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('drawbore_pin')
    expect(m[0].jointId).toBe('jnt_x')
    expect(m[0].dia).toBeCloseTo(3 / 8, 5)
    expect(m[0].center[0]).toBeCloseTo(0, 5) // centred across a (pin axis = tAxis = x)
    expect(m[0].center[1]).toBeCloseTo(0, 5) // centred in the tenon width
    expect(m[0].center[2]).toBeCloseTo(0.75 - 1.5 * (3 / 8), 5) // entry − setback
    expect(m[0].axis).toEqual([1, 0, 0])
    expect(m[0].len).toBeCloseTo(4 + 1 / 4, 5) // through a, a hair proud
  })

  it('twin: two pins, one per tenon band', () => {
    const m = jointMarkers(jointModel(stile(), rail(), 'mortise_tenon', { drawbore: true, twin: true }))
    expect(m).toHaveLength(2)
    // usable width ±1.125 in thirds → tenon centres at ±0.75.
    const ys = m.map((x) => x.center[1]).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(-0.75, 5)
    expect(ys[1]).toBeCloseTo(0.75, 5)
  })

  it('no markers without drawbore, on disabled joints, or when the pin has no room', () => {
    expect(jointMarkers(jointModel(stile(), rail(), 'mortise_tenon'))).toHaveLength(0)
    const model = jointModel(stile(), rail(), 'mortise_tenon', { drawbore: true })
    model.joints[0].enabled = false
    expect(jointMarkers(model)).toHaveLength(0)
    expect(
      jointMarkers(
        jointModel(stile(), rail(), 'mortise_tenon', {
          drawbore: true,
          through: false,
          depth: 0.6,
          pin_dia: 0.5,
        }),
      ),
    ).toHaveLength(0)
  })
})
