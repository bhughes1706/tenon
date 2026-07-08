// Pure edge-profile math (docs/chunk17-design.md §2, §6) — no WASM. §2 worked fixtures
// verbatim, the endpoint-on-axis invariant across radii/widths, and the arris → cutter
// placement table over all 8 arrises.
import { describe, it, expect } from 'vitest'
import { EdgeProfileSchema, BoardSchema, type EdgeProfile } from '../../board.js'
import { profileCurve, PROFILE_FACETS, COMPOUND_ARC_FACETS } from '../profiles.js'
import { edgeProfileCutters } from '../solids.js'
import { profileExtents } from '../../geometry/edgeProfiles.js'

const prof = (o: Record<string, unknown>): EdgeProfile =>
  EdgeProfileSchema.parse({ id: 'epf_test000001', edge: 'top', face: 'front', ...o })

describe('profileCurve — §2 worked fixtures', () => {
  it('roundover r=0.25: midpoint at θ=225°', () => {
    const r = 0.25
    const c = profileCurve(prof({ profile: 'roundover', radius: r }))
    expect(c).toHaveLength(PROFILE_FACETS + 1)
    // center (r,r), radius r, θ 270°→180° → midpoint (index 8) at θ=225°.
    const th = (225 * Math.PI) / 180
    expect(c[8][0]).toBeCloseTo(r + r * Math.cos(th), 10)
    expect(c[8][1]).toBeCloseTo(r + r * Math.sin(th), 10)
    expect(c[8][0]).toBeCloseTo(0.0732233047, 9)
  })

  it('cove r=0.25: midpoint at θ=45°, further from the arris than roundover', () => {
    const r = 0.25
    const c = profileCurve(prof({ profile: 'cove', radius: r }))
    expect(c).toHaveLength(PROFILE_FACETS + 1)
    expect(c[8][0]).toBeCloseTo((r * Math.SQRT2) / 2, 10)
    expect(c[8][1]).toBeCloseTo((r * Math.SQRT2) / 2, 10)
    expect(c[8][0]).toBeCloseTo(0.1767766953, 9)
    // sanity: cove curves AWAY from material, so its midpoint sits further out than roundover's
    const ro = profileCurve(prof({ profile: 'roundover', radius: r }))
    expect(c[8][0]).toBeGreaterThan(ro[8][0])
  })

  it('ogee r=0.25: both arcs share the exact midpoint (r/2, r/2)', () => {
    const r = 0.25
    const c = profileCurve(prof({ profile: 'ogee', radius: r }))
    expect(c).toHaveLength(PROFILE_FACETS + 1)
    expect(c[8][0]).toBeCloseTo(r / 2, 10)
    expect(c[8][1]).toBeCloseTo(r / 2, 10)
  })

  it('chamfer / rabbet: exact points, no arc sampling', () => {
    expect(profileCurve(prof({ profile: 'chamfer', width: 0.375 }))).toEqual([
      [0.375, 0],
      [0, 0.375],
    ])
    expect(profileCurve(prof({ profile: 'rabbet', width: 0.375, depth: 0.1875 }))).toEqual([
      [0.375, 0],
      [0.375, 0.1875],
      [0, 0.1875],
    ])
  })
})

describe('profileCurve — compound molding path (chunk 17.1)', () => {
  // A bead: two ccw quarter-arcs bulging out to u = 0.5, then a step down to the u = 0
  // wall. Starts on the v = 0 face, ends on the u = 0 wall, bulges past its start point.
  const bead = prof({
    profile: 'compound',
    start: [0.25, 0],
    segments: [
      { kind: 'arc', to: [0.5, 0.25], center: [0.25, 0.25], dir: 'ccw' },
      { kind: 'arc', to: [0.25, 0.5], center: [0.25, 0.25], dir: 'ccw' },
      { kind: 'line', to: [0, 0.5] },
    ],
  })

  it('walks the segment path: start on v=0, end on u=0, one point per line + N per arc', () => {
    const c = profileCurve(bead)
    expect(c[0]).toEqual([0.25, 0])
    expect(c[0][1]).toBeCloseTo(0, 12) // starts on the v = 0 face
    expect(c[c.length - 1][0]).toBeCloseTo(0, 12) // ends on the u = 0 wall
    expect(c[c.length - 1][1]).toBeCloseTo(0.5, 12)
    expect(c).toHaveLength(1 + COMPOUND_ARC_FACETS + COMPOUND_ARC_FACETS + 1) // start + 2 arcs + line
    // the bead bulges past its own start (max u = 0.5, not the endpoint's 0.25)
    expect(Math.max(...c.map((q) => q[0]))).toBeCloseTo(0.5, 6)
  })
})

describe('profileCurve — endpoint & interior invariants', () => {
  const cases: EdgeProfile[] = [
    prof({ profile: 'roundover', radius: 0.125 }),
    prof({ profile: 'roundover', radius: 0.5 }),
    prof({ profile: 'cove', radius: 0.25 }),
    prof({ profile: 'ogee', radius: 0.3125 }),
    prof({ profile: 'chamfer', width: 0.5 }),
    prof({ profile: 'rabbet', width: 0.375, depth: 0.25 }),
  ]
  for (const p of cases) {
    it(`${p.profile}: first on u-axis at reach, last on v-axis at depth, interior inside the box`, () => {
      const { reach, depth } = profileExtents(p)
      const c = profileCurve(p)
      // first point: v = 0, u = reach
      expect(c[0][1]).toBeCloseTo(0, 12)
      expect(c[0][0]).toBeCloseTo(reach, 12)
      // last point: u = 0, v = depth
      expect(c[c.length - 1][0]).toBeCloseTo(0, 12)
      expect(c[c.length - 1][1]).toBeCloseTo(depth, 12)
      // interior points: 0 < u ≤ reach and 0 < v ≤ depth (≤: rabbet's corner is at (reach, depth))
      for (let i = 1; i < c.length - 1; i++) {
        expect(c[i][0]).toBeGreaterThan(0)
        expect(c[i][0]).toBeLessThanOrEqual(reach + 1e-12)
        expect(c[i][1]).toBeGreaterThan(0)
        expect(c[i][1]).toBeLessThanOrEqual(depth + 1e-12)
      }
    })
  }
})

describe('edgeProfileCutters — arris → axis/span/corner over all 8 arrises', () => {
  const L = 10
  const W = 4
  const T = 0.75
  // axis, span, uSign per §1 table
  const EXPECT: Record<string, { axis: 0 | 1; span: [number, number]; uSign: 1 | -1; halfU: number }> = {
    top: { axis: 0, span: [-L / 2, L / 2], uSign: 1, halfU: W / 2 },
    bottom: { axis: 0, span: [-L / 2, L / 2], uSign: -1, halfU: W / 2 },
    left: { axis: 1, span: [-W / 2, W / 2], uSign: -1, halfU: L / 2 },
    right: { axis: 1, span: [-W / 2, W / 2], uSign: 1, halfU: L / 2 },
  }
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    for (const face of ['front', 'back'] as const) {
      it(`${edge}/${face}`, () => {
        const b = BoardSchema.parse({
          id: 'brd_p',
          name: 'p',
          dims: { l: L, w: W, t: T },
          species: 'spc_red_oak',
          transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
          edge_profiles: [{ id: 'epf_test000001', edge, face, profile: 'roundover', radius: 0.25 }],
        })
        const [c] = edgeProfileCutters(b)
        const e = EXPECT[edge]
        expect(c.axis).toBe(e.axis)
        expect(c.span).toEqual(e.span)
        expect(c.corner).toEqual([e.uSign, face === 'front' ? 1 : -1])
        expect(c.half).toEqual([e.halfU, T / 2])
        expect(c.feature).toBe('edge_profile')
        expect(c.edgeProfileId).toBe('epf_test000001')
      })
    }
  }
})
