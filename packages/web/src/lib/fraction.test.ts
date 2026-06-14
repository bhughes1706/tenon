import { describe, it, expect } from 'vitest'
import { formatInches, formatInchesMark, parseInches } from './fraction.js'

describe('formatInches', () => {
  it('formats whole numbers without a fraction', () => {
    expect(formatInches(2)).toBe('2')
    expect(formatInches(0)).toBe('0')
  })

  it('formats bare and mixed fractions, reduced', () => {
    expect(formatInches(0.75)).toBe('3/4')
    expect(formatInches(0.5)).toBe('1/2')
    expect(formatInches(1.375)).toBe('1 3/8')
    expect(formatInches(1.0625)).toBe('1 1/16')
  })

  it('rounds to the nearest 1/precision', () => {
    expect(formatInches(0.51, 16)).toBe('1/2') // 8.16/16 → 8/16
    expect(formatInches(0.96875, 16)).toBe('1') // 15.5/16 → 16/16 carries
    expect(formatInches(0.96875, 32)).toBe('31/32')
  })

  it('handles negatives', () => {
    expect(formatInches(-0.5)).toBe('-1/2')
    expect(formatInches(-1.25)).toBe('-1 1/4')
  })

  it('appends the inch mark via formatInchesMark', () => {
    expect(formatInchesMark(0.75)).toBe('3/4"')
  })
})

describe('parseInches', () => {
  it('parses bare and mixed fractions', () => {
    expect(parseInches('3/4')).toBe(0.75)
    expect(parseInches('1-3/8')).toBe(1.375)
    expect(parseInches('1 3/8')).toBe(1.375)
  })

  it('parses decimals and integers', () => {
    expect(parseInches('1.375')).toBe(1.375)
    expect(parseInches('.5')).toBe(0.5)
    expect(parseInches('12')).toBe(12)
  })

  it('strips the inch mark and surrounding space', () => {
    expect(parseInches('12"')).toBe(12)
    expect(parseInches('  3/4  ')).toBe(0.75)
  })

  it('converts millimetres to inches', () => {
    expect(parseInches('35mm')).toBeCloseTo(35 / 25.4, 6)
    expect(parseInches('25.4 mm')).toBeCloseTo(1, 6)
  })

  it('parses negatives', () => {
    expect(parseInches('-1/2')).toBe(-0.5)
    expect(parseInches('-1-3/8')).toBe(-1.375)
  })

  it('rejects unparseable input and divide-by-zero', () => {
    expect(parseInches('abc')).toBeNull()
    expect(parseInches('')).toBeNull()
    expect(parseInches('3/0')).toBeNull()
  })

  it('round-trips through formatInches at the grid resolution', () => {
    for (const v of [0.75, 1.375, 2, 0.0625, 3.5]) {
      expect(parseInches(formatInches(v, 16))).toBeCloseTo(v, 6)
    }
  })
})
