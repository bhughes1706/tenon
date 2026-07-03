// §6.1 property suite — the invariants every JointFn must hold: containment, removed
// volume (± 0.001 in³), the half-lap complement, idempotence, and unit normals (a valid
// carved mesh). Plus the M&T warning paths and the evaluate-level precondition / deferred
// -joint warnings. Manifold WASM inits in-process under vitest (proved by the spike).
import { describe, it, expect } from 'vitest'
import { evaluate } from '../evaluate.js'
import { JOINT_FNS } from '../joints/index.js'
import { pairSolids } from '../joints/util.js'
import type { Board } from '../../board.js'
import type { EvalMesh } from '../types.js'
import type { JointType } from '../../joint.js'
import {
  board,
  jointModel,
  removedVolume,
  maxNormalError,
  meshVolume,
} from './fixtures.js'

async function carve(model: Parameters<typeof evaluate>[0]): Promise<Map<string, EvalMesh>> {
  const { boards } = await evaluate(model)
  return new Map(boards.map((b) => [b.id, b.mesh]))
}

// Each fixture: two genuinely-overlapping 90° boards + the analytic removed volumes.
interface Case {
  name: JointType
  a: Board
  b: Board
  params?: Record<string, unknown>
  removedA: number
  removedB: number
}

const CASES: Case[] = [
  {
    name: 'butt',
    a: board({ id: 'brd_a', l: 6, w: 2, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 6, w: 2, t: 0.75, pos: [6, 0, 0] }),
    removedA: 0,
    removedB: 0,
  },
  {
    // shelf (b) dadoed into a side panel (a); b rotated so it stands in the channel.
    name: 'housing',
    a: board({ id: 'brd_a', l: 24, w: 12, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 10, w: 12, t: 0.75, pos: [0, 0, 5.125], rot: [0, 90, 0] }),
    removedA: 0.25 * 0.75 * 12, // depth(t_a/3) × b-thickness × full board run
    removedB: 0,
  },
  {
    // back panel (b) let into a rabbet on a's top-back edge.
    name: 'rabbet',
    a: board({ id: 'brd_a', l: 24, w: 6, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 24, w: 3, t: 0.5, pos: [0, 3.0, 0.5], rot: [90, 0, 0] }),
    removedA: 0.375 * 0.5 * 24, // depth(t_a/2) × width(t_b) × full edge
    removedB: 0,
  },
  {
    // two equal rails crossing in plan; b rotated 90° so they cross.
    name: 'half_lap',
    a: board({ id: 'brd_a', l: 12, w: 2, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 12, w: 2, t: 0.75, pos: [0, 0, 0], rot: [0, 0, 90] }),
    removedA: 2 * 2 * 0.375, // half the 2×2×0.75 crossing
    removedB: 2 * 2 * 0.375,
  },
  {
    // end-to-end bridle, 0.5" engagement, t = 1, tenon snapped to 3/8.
    name: 'bridle',
    a: board({ id: 'brd_a', l: 6, w: 2, t: 1, pos: [-3, 0, 0] }),
    b: board({ id: 'brd_b', l: 6, w: 2, t: 1, pos: [2.5, 0, 0] }),
    removedA: 0.375 * 0.5 * 2, // slot = centre band × engagement × width
    removedB: (1 - 0.375) * 0.5 * 2, // two cheeks = outer bands × engagement × width
  },
  {
    // through M&T: rail b tenoned through stile a, flush at the far face.
    name: 'mortise_tenon',
    a: board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] }),
    // tenonThk 0.5, tenonW = 3 − 0.375 − 0.375 = 2.25, aThrough 1.5
    removedA: 0.5 * 2.25 * 1.5,
    removedB: 1.5 * (1.5 * 3 - 0.5 * 2.25),
  },
]

describe('JointFns — removed volume (§6.1, ± 0.001 in³)', () => {
  for (const c of CASES) {
    it(`${c.name}: carves the analytic volume from each board`, async () => {
      const meshes = await carve(jointModel(c.a, c.b, c.name, c.params))
      expect(removedVolume(c.a, meshes.get('brd_a')!)).toBeCloseTo(c.removedA, 3)
      expect(removedVolume(c.b, meshes.get('brd_b')!)).toBeCloseTo(c.removedB, 3)
    })
  }
})

describe('JointFns — containment (§6.1: cutter ⊂ target board)', () => {
  for (const c of CASES) {
    if (c.name === 'butt') continue // butt removes nothing
    it(`${c.name}: every cutter sits inside its target board`, () => {
      const fn = JOINT_FNS[c.name]!
      const pair = pairSolids(c.a, c.b)
      const set = fn(pair.a, pair.b, c.params ?? {}, { model: jointModel(c.a, c.b, c.name, c.params), tol: 1 / 64 })
      const within = (cutters: typeof set.a, b: Board) => {
        const h = [b.dims.l / 2, b.dims.w / 2, b.dims.t / 2]
        for (const cut of cutters) {
          for (let i = 0; i < 3; i++) {
            expect(cut.min[i]).toBeGreaterThanOrEqual(-h[i] - 1e-6)
            expect(cut.max[i]).toBeLessThanOrEqual(h[i] + 1e-6)
          }
        }
      }
      within(set.a, c.a)
      within(set.b, c.b)
    })
  }
})

describe('half_lap — complement (§6.1: removed_a + removed_b = overlap)', () => {
  it('the two laps exactly tile the crossing volume', async () => {
    const c = CASES.find((x) => x.name === 'half_lap')!
    const meshes = await carve(jointModel(c.a, c.b, c.name))
    const removedA = removedVolume(c.a, meshes.get('brd_a')!)
    const removedB = removedVolume(c.b, meshes.get('brd_b')!)
    const overlap = 2 * 2 * 0.75
    expect(removedA + removedB).toBeCloseTo(overlap, 3)
  })
})

describe('JointFns — idempotence & valid meshes (§6.1)', () => {
  for (const c of CASES) {
    it(`${c.name}: twice → bit-identical, all normals unit length`, async () => {
      const m = jointModel(c.a, c.b, c.name, c.params)
      const first = await carve(m)
      const second = await carve(m)
      for (const id of ['brd_a', 'brd_b']) {
        const x = first.get(id)!
        const y = second.get(id)!
        expect(Array.from(x.positions)).toEqual(Array.from(y.positions))
        expect(maxNormalError(x)).toBeLessThan(1e-4)
        expect(meshVolume(x.positions)).toBeGreaterThan(0) // closed, outward-facing
      }
    })
  }
})

describe('mortise_tenon — warnings', () => {
  const stile = (over: Partial<Parameters<typeof board>[0]> = {}) =>
    board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0], ...over })
  const rail = (over: Partial<Parameters<typeof board>[0]> = {}) =>
    board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0], ...over })

  const codes = async (a: Board, b: Board, params: Record<string, unknown> = {}) =>
    (await evaluate(jointModel(a, b, 'mortise_tenon', params))).warnings.map((w) => w.code)

  it('flags a thin tenon and thin mortise walls', async () => {
    // thin stock in the tenon-thickness axis (a's l) + a thin tenon (small t_b).
    const a = stile({ l: 0.6 })
    const b = rail({ t: 0.6 })
    const c = await codes(a, b)
    expect(c).toContain('THIN_TENON')
    expect(c).toContain('THIN_MORTISE_WALL')
  })

  it('flags a deep blind mortise as NEAR_THROUGH', async () => {
    const c = await codes(stile(), rail(), { through: false, depth: 1.45 })
    expect(c).toContain('NEAR_THROUGH')
  })

  it('warns that a haunch is accepted but not carved', async () => {
    const c = await codes(stile(), rail(), { haunch: 'square' })
    expect(c).toContain('JOINT_FEATURE_UNIMPLEMENTED')
  })

  it('a clean through tenon raises no warnings', async () => {
    const c = await codes(stile(), rail())
    expect(c).toEqual([])
  })
})

// Placement tests: for each joint, assert that the cutter(s) land on the CORRECT face /
// axis, not just inside the board. These catch axis-swap or wrong-face regressions that
// removed-volume tests can't see (volume is the same either way). Each assertion targets
// a board with no rotation so local frame = world frame (shifted by pos), keeping the
// expected values readable without matrix math.
describe('JointFns — cut placement', () => {
  const ctx = (a: Board, b: Board, type: JointType) => ({
    model: jointModel(a, b, type),
    tol: 1 / 64,
  })

  it('housing: dado is on the contacted face of a (top Z face)', () => {
    // a=24×12×0.75 flat panel, b enters from +Z; dado should open at a's +Z face.
    const c = CASES.find((x) => x.name === 'housing')!
    const fn = JOINT_FNS['housing']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'housing'))
    expect(set.a).toHaveLength(1)
    // Cutter max Z = +t_a/2 = 0.375 (flush with a's top face — overcut opens it at carve time).
    expect(set.a[0].max[2]).toBeCloseTo(0.375, 5)
    // Cutter depth = t_a/3 = 0.25, so min Z = 0.375 − 0.25 = 0.125 (interior wall, stays exact).
    expect(set.a[0].min[2]).toBeCloseTo(0.125, 5)
  })

  it('rabbet: L-notch is on the right face AND edge of a', () => {
    // a=24×6×0.75 at origin, b contacts the +Y edge from +Z side.
    // depth (t_a/2=0.375) cut into +Z face; width (t_b=0.5) strip at +Y edge.
    const c = CASES.find((x) => x.name === 'rabbet')!
    const fn = JOINT_FNS['rabbet']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'rabbet'))
    expect(set.a).toHaveLength(1)
    expect(set.a[0].max[2]).toBeCloseTo(0.375, 5)  // +Z face (depth axis)
    expect(set.a[0].min[2]).toBeCloseTo(0, 5)       // depth = t_a/2, so 0.375−0.375=0
    expect(set.a[0].max[1]).toBeCloseTo(3, 5)       // +Y edge (w_a/2=3, where b sits)
    expect(set.a[0].min[1]).toBeCloseTo(2.5, 5)     // width = t_b=0.5, so 3−0.5=2.5
  })

  it('half_lap: a loses the bottom Z half, b loses the top Z half (split=0.5)', () => {
    // Two equal rails crossing in plan. Split axis = Z (thinnest: 0.75 vs 2×2).
    // a is "on top" (both centres at Z=0; a wins tie). a removes Z:[−0.375, 0], b Z:[0, +0.375].
    // b is rotated 90° around Z; in b's local frame the cut is also its +Z half.
    const c = CASES.find((x) => x.name === 'half_lap')!
    const fn = JOINT_FNS['half_lap']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'half_lap'))
    // a (no rotation): cutter is bottom half in local Z.
    expect(set.a[0].min[2]).toBeCloseTo(-0.375, 5)
    expect(set.a[0].max[2]).toBeCloseTo(0, 5)
    // b (rotated 90° around Z): in b's local frame the cutter is the top half in local Z.
    expect(set.b[0].min[2]).toBeCloseTo(0, 5)
    expect(set.b[0].max[2]).toBeCloseTo(0.375, 5)
  })

  it('bridle: slot is centred in thickness and reaches a\'s end face', () => {
    // a=6×2×1 at [−3,0,0]. The overlap is at a's right end (+X face).
    // Tenon = snap(1/3 * 1, 1/8) = 0.375. Slot centred: Z:[−0.1875, +0.1875].
    const c = CASES.find((x) => x.name === 'bridle')!
    const fn = JOINT_FNS['bridle']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'bridle'))
    expect(set.a).toHaveLength(1)
    // Slot reaches a's +X end face (halfL = 3).
    expect(set.a[0].max[0]).toBeCloseTo(3, 5)
    // Slot is centred in Z: midpoint ≈ 0.
    expect((set.a[0].min[2] + set.a[0].max[2]) / 2).toBeCloseTo(0, 5)
    // Tenon thickness = 0.375 → slot extent in Z = 0.375.
    expect(set.a[0].max[2] - set.a[0].min[2]).toBeCloseTo(0.375, 5)
  })

  it('mortise_tenon: mortise is centred in a\'s thickness and runs full depth (through)', () => {
    // a=4×4×1.5 at origin. b enters along Z; tAxis=X; tenonThk=snap(0.5,1/16)=0.5.
    // Mortise: X:[−0.25,+0.25] (centred), Z:[−0.75,+0.75] (through).
    const c = CASES.find((x) => x.name === 'mortise_tenon')!
    const fn = JOINT_FNS['mortise_tenon']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'mortise_tenon'))
    expect(set.a).toHaveLength(1)
    // Centred in a's thickness axis (X): ±tenonThk/2 = ±0.25.
    expect(set.a[0].min[0]).toBeCloseTo(-0.25, 5)
    expect(set.a[0].max[0]).toBeCloseTo(0.25, 5)
    // Through mortise: full Z extent of a = ±t_a/2 = ±0.75.
    expect(set.a[0].min[2]).toBeCloseTo(-0.75, 5)
    expect(set.a[0].max[2]).toBeCloseTo(0.75, 5)
  })
})

// Pair-frame carving (§Angle readiness): joints are exact whenever the two boards are
// square TO EACH OTHER, regardless of the assembly's world orientation. Each case here
// takes a canonical fixture and rigid-rotates the WHOLE pair about the origin; the
// carved (board-local) volumes must equal the unrotated analytic targets. These fail
// against the old world-frame math (world AABBs of tilted boards over-report, and
// worldBoxToLocal degrades to a conservative bound).
describe('pair-frame carving — assembly rotated off-axis', () => {
  it('mortise_tenon: yaw-rotated 30° assembly carves the exact analytic volumes', async () => {
    // The canonical through-M&T fixture rotated 30° about world Y: positions rotate
    // (rotY(30)·[0,0,1.25]), world Euler yaws compose additively (90° + 30° = 120°).
    const a = board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0], rot: [0, 30, 0] })
    const b = board({
      id: 'brd_b', l: 4, w: 3, t: 1.5,
      pos: [0.6249999999999999, 0, 1.0825317547305484], rot: [0, 120, 0],
    })
    const { warnings } = await evaluate(jointModel(a, b, 'mortise_tenon'))
    expect(warnings).toEqual([])
    const meshes = await carve(jointModel(a, b, 'mortise_tenon'))
    expect(removedVolume(a, meshes.get('brd_a')!)).toBeCloseTo(0.5 * 2.25 * 1.5, 3)
    expect(removedVolume(b, meshes.get('brd_b')!)).toBeCloseTo(1.5 * (1.5 * 3 - 0.5 * 2.25), 3)
  })

  it('half_lap: roll-rotated 30° assembly carves exact complementary laps', async () => {
    // The canonical crossing-rails fixture rotated 30° about world X. Both boards sit at
    // the origin so positions are unchanged; b's world rotation composes to Euler-XYZ
    // [30, 0, 90] (= Rx(30)·Rz(90), matching this codebase's Rx·Ry·Rz convention).
    const a = board({ id: 'brd_a', l: 12, w: 2, t: 0.75, pos: [0, 0, 0], rot: [30, 0, 0] })
    const b = board({ id: 'brd_b', l: 12, w: 2, t: 0.75, pos: [0, 0, 0], rot: [30, 0, 90] })
    const meshes = await carve(jointModel(a, b, 'half_lap'))
    const removedA = removedVolume(a, meshes.get('brd_a')!)
    const removedB = removedVolume(b, meshes.get('brd_b')!)
    expect(removedA).toBeCloseTo(2 * 2 * 0.375, 3)
    expect(removedB).toBeCloseTo(2 * 2 * 0.375, 3)
    expect(removedA + removedB).toBeCloseTo(2 * 2 * 0.75, 3) // complement invariant holds rotated
  })

  it('compound-angle pair (not square to each other) is rejected, not carved wrong', async () => {
    const a = board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1], rot: [0, 45, 0] })
    const { boards, warnings } = await evaluate(jointModel(a, b, 'mortise_tenon'))
    expect(warnings.map((w) => w.code)).toContain('JOINT_PRECONDITION_FAILED')
    expect(warnings.find((w) => w.code === 'JOINT_PRECONDITION_FAILED')!.msg).toMatch(/square|compound/)
    // Both boards render as full, uncut base solids.
    const meshes = new Map(boards.map((x) => [x.id, x.mesh]))
    expect(meshVolume(meshes.get('brd_a')!.positions)).toBeCloseTo(4 * 4 * 1.5, 3)
    expect(meshVolume(meshes.get('brd_b')!.positions)).toBeCloseTo(4 * 3 * 1.5, 3)
  })
})

describe('evaluate — joint-level warnings', () => {
  it('warns JOINT_FEATURE_UNIMPLEMENTED for a deferred joint type (box_joint)', async () => {
    const a = board({ id: 'brd_a', l: 6, w: 4, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 6, w: 4, t: 0.75, pos: [0, 4, 0] })
    const { warnings } = await evaluate(jointModel(a, b, 'box_joint'))
    expect(warnings.map((w) => w.code)).toContain('JOINT_FEATURE_UNIMPLEMENTED')
  })

  it('warns JOINT_PRECONDITION_FAILED and carves uncut when boards no longer touch', async () => {
    // Boards far apart but with a joint (a later move invalidated it, §2.4 #3).
    const a = board({ id: 'brd_a', l: 6, w: 2, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 6, w: 2, t: 0.75, pos: [50, 0, 0] })
    const { boards, warnings } = await evaluate(jointModel(a, b, 'mortise_tenon'))
    expect(warnings.map((w) => w.code)).toContain('JOINT_PRECONDITION_FAILED')
    // No cutters applied → both boards are full base solids.
    const meshes = new Map(boards.map((x) => [x.id, x.mesh]))
    expect(meshVolume(meshes.get('brd_a')!.positions)).toBeCloseTo(6 * 2 * 0.75, 3)
    expect(meshVolume(meshes.get('brd_b')!.positions)).toBeCloseTo(6 * 2 * 0.75, 3)
  })
})
