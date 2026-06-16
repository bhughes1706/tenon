// §6.1 property suite — the invariants every JointFn must hold: containment, removed
// volume (± 0.001 in³), the half-lap complement, idempotence, and unit normals (a valid
// carved mesh). Plus the M&T warning paths and the evaluate-level precondition / deferred
// -joint warnings. Manifold WASM inits in-process under vitest (proved by the spike).
import { describe, it, expect } from 'vitest'
import { evaluate } from '../evaluate.js'
import { JOINT_FNS } from '../joints/index.js'
import { worldAABB, worldOBB } from '../../geometry/aabb.js'
import type { Board } from '../../board.js'
import type { BoardSolid, EvalMesh } from '../types.js'
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

const solid = (b: Board): BoardSolid => ({ board: b, aabb: worldAABB(b), obb: worldOBB(b) })

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
      const set = fn(solid(c.a), solid(c.b), c.params ?? {}, { model: jointModel(c.a, c.b, c.name, c.params), tol: 1 / 64 })
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
