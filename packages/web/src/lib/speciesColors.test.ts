import { describe, it, expect } from 'vitest'
import { speciesColor } from './speciesColors.js'

describe('speciesColor', () => {
  it('returns the seeded hex for known species', () => {
    expect(speciesColor('spc_black_walnut')).toBe('#5c4536')
    expect(speciesColor('spc_red_oak')).toBe('#c9a06a')
  })

  it('returns a deterministic warm fallback for unknown species', () => {
    const a = speciesColor('spc_mystery_wood')
    const b = speciesColor('spc_mystery_wood')
    expect(a).toBe(b)
    expect(a).toMatch(/^hsl\(/)
  })

  it('gives different unknown species different colors', () => {
    expect(speciesColor('spc_one')).not.toBe(speciesColor('spc_twozzz'))
  })
})
