import { describe, it, expect } from 'vitest'
import { fmtFraction } from '../format.js'

describe('fmtFraction', () => {
  it('renders simple fractions reduced', () => {
    expect(fmtFraction(0.375)).toBe('3/8')
    expect(fmtFraction(0.5)).toBe('1/2')
    expect(fmtFraction(0.25)).toBe('1/4')
  })
  it('renders mixed numbers with a hyphen (spec note style)', () => {
    expect(fmtFraction(1.25)).toBe('1-1/4')
    expect(fmtFraction(2.5)).toBe('2-1/2')
    expect(fmtFraction(1.5)).toBe('1-1/2')
  })
  it('renders whole numbers and zero without a fraction', () => {
    expect(fmtFraction(3)).toBe('3')
    expect(fmtFraction(0)).toBe('0')
  })
  it('rounds to the precision denominator and carries to the whole', () => {
    expect(fmtFraction(0.9999)).toBe('1') // rounds up, num === den carry
    expect(fmtFraction(1 / 3)).toBe('5/16') // 0.333 → nearest 1/16
  })
})
