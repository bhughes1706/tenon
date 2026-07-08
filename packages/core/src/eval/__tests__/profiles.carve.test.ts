// Edge-profile carve (docs/chunk17-design.md §3, §6) — the WASM surface. Confirms the
// swept-profile cutter removes the RIGHT amount from the CORRECT corner on all 8 arrises
// (the winding/placement regression called out in §3 step 5), that adjacent profiles
// carve cleanly, that PROFILE_JOINT_OVERLAP fires only on a real overlap, and that a
// profile edit invalidates only its own board's memo.
import { describe, it, expect } from 'vitest'
import { board, boardModel, jointModel, removedVolume, maxNormalError } from './fixtures.js'
import { profileCurve } from '../profiles.js'
import { EdgeProfileSchema, BoardSchema, type EdgeProfile } from '../../board.js'
import { ModelSchema } from '../../model.js'
import { JointSchema } from '../../joint.js'
import { evaluate, createEvalCache } from '../evaluate.js'
import { WarningCode } from '../../common.js'

const prof = (o: Record<string, unknown>): EdgeProfile => EdgeProfileSchema.parse({ id: 'epf_test000001', ...o })

// Removed cross-section area = the polygon bounded by the arris corner (origin) and the
// profile curve — works for every profile type (triangle, quarter-disc, S, step). The
// carve uses the SAME faceted curve, so this is the exact expected in-board area.
function crossArea(p: EdgeProfile): number {
  const poly: [number, number][] = [[0, 0], ...profileCurve(p)]
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}

// Does any remaining-solid vertex sit on the corner-edge line at (uAxis = uVal, z = zVal)?
// A profile carved on that arris bevels the whole edge away, so the answer must be no.
function hasCornerEdge(positions: Float32Array, uAxis: 0 | 1, uVal: number, zVal: number): boolean {
  for (let o = 0; o < positions.length; o += 3) {
    if (Math.abs(positions[o + uAxis] - uVal) < 1e-4 && Math.abs(positions[o + 2] - zVal) < 1e-4) return true
  }
  return false
}

const L = 8
const W = 4
const T = 0.75

// (uAxis, uVal, span) per §1 for a board L×W×T at the origin.
const ARRIS: Record<'top' | 'bottom' | 'left' | 'right', { uAxis: 0 | 1; uVal: number; spanLen: number }> = {
  top: { uAxis: 1, uVal: W / 2, spanLen: L },
  bottom: { uAxis: 1, uVal: -W / 2, spanLen: L },
  left: { uAxis: 0, uVal: -L / 2, spanLen: W },
  right: { uAxis: 0, uVal: L / 2, spanLen: W },
}

describe('edge-profile carve — feature provenance', () => {
  it('a single roundover produces one edge_profile feature carrying its id, with positive volume removed', async () => {
    const p = prof({ edge: 'top', face: 'front', profile: 'roundover', radius: 0.25 })
    const b = board({ id: 'brd_r', l: L, w: W, t: T, pos: [0, 0, 0], edge_profiles: [p] })
    const { boards, warnings } = await evaluate(boardModel(b))
    const mesh = boards[0].mesh
    const feats = mesh.features.filter((f) => f.kind === 'edge_profile')
    expect(feats).toHaveLength(1)
    expect(feats[0].edgeProfileId).toBe('epf_test000001')
    expect(feats[0].jointId).toBeUndefined()
    expect(removedVolume(b, mesh)).toBeGreaterThan(0)
    expect(warnings).toHaveLength(0)
    expect(maxNormalError(mesh)).toBeLessThan(1e-4)
  })
})

describe('edge-profile carve — correct amount from the correct corner, all 8 arrises', () => {
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    for (const face of ['front', 'back'] as const) {
      it(`ogee on ${edge}/${face}`, async () => {
        const p = prof({ edge, face, profile: 'ogee', radius: 0.25 })
        const b = board({ id: 'brd_o', l: L, w: W, t: T, pos: [0, 0, 0], edge_profiles: [p] })
        const { boards } = await evaluate(boardModel(b))
        const mesh = boards[0].mesh
        const { uAxis, uVal, spanLen } = ARRIS[edge]
        const zVal = face === 'front' ? T / 2 : -T / 2
        // right amount: cross-section area × the full arris length
        expect(removedVolume(b, mesh)).toBeCloseTo(crossArea(p) * spanLen, 4)
        // correct corner ONLY: the profiled arris edge is gone, every other corner survives
        expect(hasCornerEdge(mesh.positions, uAxis, uVal, zVal)).toBe(false)
        // opposite face's same edge is untouched → still present
        expect(hasCornerEdge(mesh.positions, uAxis, uVal, -zVal)).toBe(true)
        expect(maxNormalError(mesh)).toBeLessThan(1e-4)
      })
    }
  }
})

describe('edge-profile carve — chamfer amount matches analytic w²/2 per arris', () => {
  for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
    it(`chamfer on ${edge}/front`, async () => {
      const w = 0.375
      const p = prof({ edge, face: 'front', profile: 'chamfer', width: w })
      const b = board({ id: 'brd_c', l: L, w: W, t: T, pos: [0, 0, 0], edge_profiles: [p] })
      const { boards } = await evaluate(boardModel(b))
      expect(removedVolume(b, boards[0].mesh)).toBeCloseTo((w * w) / 2 * ARRIS[edge].spanLen, 5)
    })
  }
})

describe('edge-profile carve — two adjacent profiles on one board', () => {
  it('top/front roundover + right/front chamfer carve together without manifold errors', async () => {
    const b = board({
      id: 'brd_two',
      l: L,
      w: W,
      t: T,
      pos: [0, 0, 0],
      edge_profiles: [
        { id: 'epf_test000001', edge: 'top', face: 'front', profile: 'roundover', radius: 0.25 },
        { id: 'epf_test000002', edge: 'right', face: 'front', profile: 'chamfer', width: 0.375 },
      ],
    })
    const { boards, warnings } = await evaluate(boardModel(b))
    const mesh = boards[0].mesh
    expect(mesh.features.filter((f) => f.kind === 'edge_profile')).toHaveLength(2)
    expect(removedVolume(b, mesh)).toBeGreaterThan(0)
    expect(maxNormalError(mesh)).toBeLessThan(1e-4)
    expect(warnings).toHaveLength(0)
  })
})

describe('edge-profile carve — compound molding (chunk 17.1)', () => {
  // A bead that bulges to u = 0.5 (past its 0.25 start) then steps to the u = 0 wall — the
  // case the overcut-cap fix exists for (endpoint-sized cap would self-intersect).
  const bead = {
    id: 'epf_test000001', edge: 'top' as const, face: 'front' as const, profile: 'compound' as const,
    label: 'test bead',
    start: [0.25, 0] as [number, number],
    segments: [
      { kind: 'arc' as const, to: [0.5, 0.25] as [number, number], center: [0.25, 0.25] as [number, number], dir: 'ccw' as const },
      { kind: 'arc' as const, to: [0.25, 0.5] as [number, number], center: [0.25, 0.25] as [number, number], dir: 'ccw' as const },
      { kind: 'line' as const, to: [0, 0.5] as [number, number] },
    ],
  }

  it('sweeps a bulging profile: exact removed area, correct corner, valid manifold', async () => {
    const b = board({ id: 'brd_m', l: L, w: W, t: 1.25, pos: [0, 0, 0], edge_profiles: [bead] })
    const { boards } = await evaluate(boardModel(b))
    const mesh = boards[0].mesh
    const p = prof(bead)
    // removed = the swept cross-section area × the full arris length (the bulge included)
    expect(removedVolume(b, mesh)).toBeCloseTo(crossArea(p) * L, 4)
    // correct corner: the top/front arris (y = +W/2, z = +T/2) is routed away
    expect(hasCornerEdge(mesh.positions, 1, W / 2, 1.25 / 2)).toBe(false)
    expect(mesh.features.filter((f) => f.kind === 'edge_profile')).toHaveLength(1)
    expect(maxNormalError(mesh)).toBeLessThan(1e-4)
  })
})

describe('PROFILE_JOINT_OVERLAP', () => {
  // Dovetail "through case side" fixture — sockets on board a sit at its +x end.
  const dtA = (profiles: unknown[]) =>
    BoardSchema.parse({
      id: 'brd_a',
      name: 'case side',
      dims: { l: 6, w: 12, t: 0.75 },
      species: 'spc_red_oak',
      transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
      edge_profiles: profiles,
    })
  const dtB = board({ id: 'brd_b', l: 4, w: 12, t: 0.75, pos: [2.625, 0, 1.625], rot: [0, 90, 0] })
  const model = (profiles: unknown[]) =>
    ModelSchema.parse({
      id: 'mdl_dt',
      rev: 0,
      name: 'dt',
      boards: [dtA(profiles), dtB],
      joints: [JointSchema.parse({ id: 'jnt_dt', a: 'brd_a', b: 'brd_b', type: 'dovetail', params: {} })],
      groups: [],
      meta: { created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' },
    })

  it('fires when a profile overlaps the joint corner (right edge, same end as the dovetail)', async () => {
    const { warnings } = await evaluate(
      model([{ id: 'epf_test000001', edge: 'right', face: 'front', profile: 'roundover', radius: 0.25 }]),
    )
    const w = warnings.find((x) => x.code === WarningCode.PROFILE_JOINT_OVERLAP)
    expect(w).toBeDefined()
    expect(w!.boards).toEqual(['brd_a'])
    expect(w!.joints).toEqual(['jnt_dt'])
  })

  it('stays silent when the profile is on the opposite end (left edge, clear of the joint)', async () => {
    const { warnings } = await evaluate(
      model([{ id: 'epf_test000001', edge: 'left', face: 'front', profile: 'roundover', radius: 0.25 }]),
    )
    expect(warnings.find((x) => x.code === WarningCode.PROFILE_JOINT_OVERLAP)).toBeUndefined()
  })
})

describe('edge-profile memo', () => {
  it('patching one board’s edge_profiles re-carves only it; siblings cache-hit', async () => {
    const mk = (radius: number) =>
      ModelSchema.parse({
        id: 'mdl_pm',
        rev: 0,
        name: 'pm',
        boards: [
          board({ id: 'brd_x', l: L, w: W, t: T, pos: [0, 0, 0], edge_profiles: [{ id: 'epf_test000001', edge: 'top', face: 'front', profile: 'roundover', radius }] }),
          board({ id: 'brd_y', l: L, w: W, t: T, pos: [50, 0, 0] }),
        ],
        joints: [],
        groups: [],
        meta: { created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' },
      })
    const cache = createEvalCache()
    const first = await evaluate(mk(0.25), cache)
    const next = await evaluate(mk(0.375), cache)
    const meshOf = (r: Awaited<ReturnType<typeof evaluate>>, id: string) => r.boards.find((x) => x.id === id)!.mesh
    expect(meshOf(next, 'brd_x')).not.toBe(meshOf(first, 'brd_x')) // profile changed → re-carve
    expect(meshOf(next, 'brd_y')).toBe(meshOf(first, 'brd_y')) // untouched → cache hit
  })
})
