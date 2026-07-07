// §5.7 / §5.8 pure spacing solvers — the docs/chunk16-design.md §2 (box) and §4 (dovetail)
// worked fixtures, verbatim. No WASM, no Board: numbers in, layout out.
import { describe, it, expect } from 'vitest'
import { boxSpacing, boxFingerCount, dovetailSpacing } from '../joints/spacing.js'

describe('boxSpacing (§2)', () => {
  it('W=4, t_thin=1/2 → p=1/2, n=7 (tie broken to smaller), w_end=3/4', () => {
    const lay = boxSpacing(4, 1 / 2)
    expect(lay.p).toBe(1 / 2)
    // candidates n=7 (|4−3.5|=0.5) vs n=9 (|4−4.5|=0.5) → tie → 7.
    expect(lay.n).toBe(7)
    expect(lay.wEnd).toBe(3 / 4)
    // widths [3/4, 1/2 ×5, 3/4]; stations are the cumulative bounds.
    expect(lay.stations).toEqual([0, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 4])
    const widths = lay.stations.slice(1).map((s, i) => s - lay.stations[i])
    expect(widths).toEqual([0.75, 0.5, 0.5, 0.5, 0.5, 0.5, 0.75])
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 10) // sum = W
    expect(lay.warnings).toEqual([])
  })

  it('W=1.25, pin_width=3/4 → nearest odd 1 clamps to 3; w_end=1/4 warns BOX_THIN_END_PIN', () => {
    const lay = boxSpacing(1.25, 0.5, { pinWidth: 3 / 4 })
    expect(lay.p).toBe(3 / 4)
    expect(lay.n).toBe(3)
    expect(lay.wEnd).toBeCloseTo(1 / 4, 10) // p + (W−np)/2 = 0.75 + (1.25−2.25)/2
    expect(lay.warnings.map((w) => w.code)).toContain('BOX_THIN_END_PIN')
  })

  it('W=2.24, t_thin=0.8 → p=3/4 (snap+clamp), n=3, sub-1/64 remainder, no warning', () => {
    const lay = boxSpacing(2.24, 0.8)
    expect(lay.p).toBe(3 / 4) // clamp(snap(0.8, 1/8), 1/4, 3/4) = clamp(0.75, …) = 0.75
    expect(lay.n).toBe(3)
    expect(lay.wEnd).toBeCloseTo(3 / 4 - 0.005, 10) // 0.75 + (2.24−2.25)/2
    expect(lay.warnings).toEqual([])
  })

  it('an explicit pin_width is used verbatim (overrides the snap/clamp default)', () => {
    expect(boxSpacing(10, 0.5, { pinWidth: 0.9 }).p).toBe(0.9) // above the 3/4 clamp
  })

  it('boxFingerCount is always an odd integer ≥ 3', () => {
    for (const [W, p] of [[4, 0.5], [1.25, 0.75], [2.24, 0.75], [10, 0.5], [0.9, 0.4]] as const) {
      const n = boxFingerCount(W, p)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n % 2).toBe(1)
    }
  })
})

describe('dovetailSpacing (§4)', () => {
  it('case side: W=12, t_b=3/4, ℓ=3/4, 1:8 → N=5, P̄=3/4, T̄=1.5, f=3/32', () => {
    const lay = dovetailSpacing({ W: 12, tB: 0.75, ell: 0.75, slope: '1:8', pins: 'auto' })
    expect(lay.f).toBeCloseTo(3 / 32, 10)
    expect(lay.tails).toBe(5)
    expect(lay.meanPin).toBeCloseTo(3 / 4, 10)
    expect(lay.meanTail).toBeCloseTo(1.5, 10)
    expect(lay.meanHalfPin).toBeCloseTo(3 / 4, 10)
    // element conversions
    const tail = lay.elements.find((e) => e.kind === 'tail')!
    expect(tail.base[1] - tail.base[0]).toBeCloseTo(1.40625, 10) // T_base = T̄ − f
    expect(tail.tip[1] - tail.tip[0]).toBeCloseTo(1.59375, 10) // T_tip = T̄ + f
    const pin = lay.elements.find((e) => e.kind === 'pin')!
    expect(pin.tip[1] - pin.tip[0]).toBeCloseTo(21 / 32, 10) // P_tip = P̄ − f ≈ 0.656
    expect(lay.degenerate).toBe(false)
    expect(lay.warnings).toEqual([])
  })

  it('case side widths tile W at both the base and the tip station (flare cancels)', () => {
    const lay = dovetailSpacing({ W: 12, tB: 0.75, ell: 0.75, slope: '1:8', pins: 'auto' })
    const sumBase = lay.elements.reduce((s, e) => s + (e.base[1] - e.base[0]), 0)
    const sumTip = lay.elements.reduce((s, e) => s + (e.tip[1] - e.tip[0]), 0)
    expect(sumBase).toBeCloseTo(12, 10)
    expect(sumTip).toBeCloseTo(12, 10)
    // element list order: half_pin, tail, pin, …, tail, half_pin (2N+1 = 11)
    expect(lay.elements.map((e) => e.kind)).toEqual([
      'half_pin', 'tail', 'pin', 'tail', 'pin', 'tail', 'pin', 'tail', 'pin', 'tail', 'half_pin',
    ])
  })

  it('case side: analytic partition — a (tails) + b (pins) = W·ℓ·t_b', () => {
    const lay = dovetailSpacing({ W: 12, tB: 0.75, ell: 0.75, slope: '1:8', pins: 'auto' })
    const tB = 0.75
    const ell = 0.75
    const mean = (e: { base: [number, number]; tip: [number, number] }) =>
      ((e.base[1] - e.base[0]) + (e.tip[1] - e.tip[0])) / 2
    const volA = lay.elements.filter((e) => e.kind === 'tail').reduce((s, e) => s + mean(e) * ell * tB, 0)
    const volB = lay.elements.filter((e) => e.kind !== 'tail').reduce((s, e) => s + mean(e) * ell * tB, 0)
    expect(volA).toBeCloseTo(5 * 1.5 * 0.75 * 0.75, 6) // = 4.21875 in³
    expect(volA + volB).toBeCloseTo(12 * 0.75 * 0.75, 6) // = 6.75 in³
  })

  it('drawer half-blind: W=3, t_b=1/2, ℓ=9/16, 1:8 → N=2, P̄=3/7, T̄=6/7', () => {
    const lay = dovetailSpacing({ W: 3, tB: 0.5, ell: 9 / 16, slope: '1:8', pins: 'auto' })
    expect(lay.tails).toBe(2)
    expect(lay.meanPin).toBeCloseTo(3 / 7, 10)
    expect(lay.meanTail).toBeCloseTo(6 / 7, 10)
    expect(lay.f).toBeCloseTo(9 / 128, 10)
    const pin = lay.elements.find((e) => e.kind === 'pin')!
    expect(pin.tip[1] - pin.tip[0]).toBeCloseTo(3 / 7 - 9 / 128, 6) // P_tip ≈ 0.358
  })

  it('thin-stock: W=8, t_b=1/4, ℓ=3/8, 1:6 → N=10, P_tip≈0.196 warns DOVETAIL_THIN_PIN', () => {
    // The design's 5/16 suggestion lands at P_tip≈0.2575 (above the 1/4 threshold, no warn);
    // t_b=1/4 gives more, thinner tails and trips it. (See handoff report — fixture pinned here.)
    const lay = dovetailSpacing({ W: 8, tB: 0.25, ell: 0.375, slope: '1:6', pins: 'auto' })
    expect(lay.tails).toBe(10)
    expect(lay.f).toBeCloseTo(1 / 16, 10)
    const pin = lay.elements.find((e) => e.kind === 'pin')!
    expect(pin.tip[1] - pin.tip[0]).toBeCloseTo(8 / 31 - 1 / 16, 6) // ≈ 0.1956
    expect(lay.warnings.map((w) => w.code)).toContain('DOVETAIL_THIN_PIN')
  })

  it('explicit half_pin_width uses the (3N−1) width sum', () => {
    const lay = dovetailSpacing({ W: 6, tB: 0.5, ell: 0.5, slope: '1:8', pins: 2, halfPinWidth: 0.25 })
    expect(lay.tails).toBe(3) // numeric pins = full-pin count → N = pins + 1
    expect(lay.meanHalfPin).toBe(0.25)
    expect(lay.meanPin).toBeCloseTo((6 - 0.5) / (3 * 3 - 1), 10)
    const sumBase = lay.elements.reduce((s, e) => s + (e.base[1] - e.base[0]), 0)
    expect(sumBase).toBeCloseTo(6, 10)
  })

  it('a too-steep slope over deep engagement flags the tail as degenerate', () => {
    const lay = dovetailSpacing({ W: 6, tB: 0.5, ell: 3, slope: '1:2', pins: 'auto' })
    expect(lay.degenerate).toBe(true) // T_base = T̄ − f ≤ 0
  })
})
