import { describe, it, expect } from 'vitest'
import { BoardSchema } from '@tenon/core'
import { availableJointTypes, defaultJointType, IMPLEMENTED_JOINT_TYPES, DEFERRED_JOINT_TYPES } from './jointTypes.js'

// Overlapping pair (mirrors core's validators fixtures): A x∈[-15,15], B x∈[11,29]
// → 4" of engagement, enough for every first-wave precondition.
const A = BoardSchema.parse({
  id: 'brd_AAAAAAAAAA',
  name: 'stile',
  dims: { l: 30, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
})
const B = BoardSchema.parse({
  id: 'brd_BBBBBBBBBB',
  name: 'rail',
  dims: { l: 18, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [20, 0, 0], rot: [0, 0, 0] },
})
const FAR_B = BoardSchema.parse({ ...B, transform: { pos: [60, 0, 0], rot: [0, 0, 0] } })

describe('availableJointTypes', () => {
  it('passes every implemented type for a genuinely overlapping pair', () => {
    const opts = availableJointTypes(A, B)
    for (const t of IMPLEMENTED_JOINT_TYPES) {
      expect(opts.find((o) => o.type === t)?.ok, t).toBe(true)
    }
  })

  it('fails all implemented types with a teaching reason when the boards do not touch', () => {
    const opts = availableJointTypes(A, FAR_B)
    for (const t of IMPLEMENTED_JOINT_TYPES) {
      const o = opts.find((x) => x.type === t)!
      expect(o.ok, t).toBe(false)
      expect(o.reason, t).toBeTruthy()
    }
  })

  it('always lists deferred types disabled', () => {
    const opts = availableJointTypes(A, B)
    for (const t of DEFERRED_JOINT_TYPES) {
      const o = opts.find((x) => x.type === t)!
      expect(o.ok).toBe(false)
      expect(o.deferred).toBe(true)
    }
  })
})

describe('defaultJointType', () => {
  it('preselects mortise_tenon for a pair that supports it (priority order)', () => {
    expect(defaultJointType(availableJointTypes(A, B))).toBe('mortise_tenon')
  })

  it('returns null when nothing passes', () => {
    expect(defaultJointType(availableJointTypes(A, FAR_B))).toBeNull()
  })
})
