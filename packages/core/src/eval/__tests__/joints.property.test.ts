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
import { cutterBounds } from '../types.js'
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
  label?: string // distinguishes multiple fixtures of one joint type
  a: Board
  b: Board
  params?: Record<string, unknown>
  removedA: number
  removedB: number
}

// ── Chunk 12 fixtures (docs/chunk12-design.md) ────────────────────────────────
// Frame corner: stile a along x with a panel groove on its inside (+y) edge; rail b
// enters from +y (rot z 90 → length along y), flush with the stile's +x end. Blind
// M&T: engagement 1.25 < stile width 2.5. tenonThk = snap(0.75/3) = 0.25 = groove
// width, centred — the haunch stub seats exactly in the groove.
const PANEL_GROOVE = { id: 'egv_panel', edge: 'top', depth: 0.375, width: 0.25, offset: 0 }
const frameStile = (grooves: unknown[] = [PANEL_GROOVE]) =>
  board({ id: 'brd_a', l: 24, w: 2.5, t: 0.75, pos: [0, 0, 0], edge_grooves: grooves })
const frameRail = () => board({ id: 'brd_b', l: 6, w: 3, t: 0.75, pos: [10.5, 3, 0], rot: [0, 0, 90] })
// Width layout: R spans x [9, 12]; far shoulder 3/8 → U = 2.625, haunch L = U/4 =
// 0.65625, main tenon 1.96875 wide, mortise depth 1.25 (blind), haunch depth 0.375.
const FRAME = {
  groove: 24 * 0.375 * 0.25, // board-level channel, full stile length
  mortise: 0.25 * 1.96875 * 1.25,
  grooveMortiseOverlap: 1.96875 * 0.375 * 0.25, // mortise mouth crosses the channel
  cheeks: 0.5 * 3 * 1.25, // (0.75 − 0.25) thick × rail width × engagement
  shoulder: 0.375 * 1.25 * 0.25, // far-side width shoulder, net of the cheeks
  squareHaunch: 0.65625 * (1.25 - 0.375) * 0.25, // band beyond the stub, net of cheeks
  slopedHaunch: 0.25 * 0.65625 * ((1.25 - 0.375) + 1.25) / 2, // trapezoid: stub depth → 0
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
  {
    // §5.6 square haunch: stub fills the groove run-out — the socket unions into the
    // groove (zero extra volume on a); the mortise mouth crosses the groove channel.
    name: 'mortise_tenon',
    label: 'mortise_tenon (square haunch, grooved stile)',
    a: frameStile(),
    b: frameRail(),
    params: { haunch: 'square' },
    removedA: FRAME.groove + FRAME.mortise - FRAME.grooveMortiseOverlap,
    removedB: FRAME.cheeks + FRAME.shoulder + FRAME.squareHaunch,
  },
  {
    // §5.6 sloped haunch: the stub tapers to zero at the end grain (frustum carve).
    name: 'mortise_tenon',
    label: 'mortise_tenon (sloped haunch)',
    a: frameStile(),
    b: frameRail(),
    params: { haunch: 'sloped' },
    removedA: FRAME.groove + FRAME.mortise - FRAME.grooveMortiseOverlap, // sloped socket ⊂ groove
    removedB: FRAME.cheeks + FRAME.shoulder + FRAME.slopedHaunch,
  },
  {
    // §5.6 wedged through M&T: mortise flares 1/8 per side at the exit face (trapezoid
    // 2.25 → 2.5 wide) + two 1/16 kerfs stopping 1/2 short of the shoulder.
    name: 'mortise_tenon',
    label: 'mortise_tenon (wedged through)',
    a: board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] }),
    params: { wedged: true },
    removedA: 0.5 * 1.5 * ((2.25 + 2.5) / 2),
    removedB: 1.5 * (1.5 * 3 - 0.5 * 2.25) + 2 * ((1 / 16) * (1.5 - 0.5) * 0.5),
  },
  {
    // §5.6 twin: usable width 2.25 in thirds — two 0.75 tenons, 0.75 gap.
    name: 'mortise_tenon',
    label: 'mortise_tenon (twin)',
    a: board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] }),
    params: { twin: true },
    removedA: 2 * (0.5 * 0.75 * 1.5),
    removedB: 1.5 * 3 * 1.5 - 2 * (0.5 * 0.75 * 1.5), // overlap block minus the two tenons
  },
  // ── Chunk 16 (docs/chunk16-design.md) ─────────────────────────────────────────
  // Box corner: a's +x end meets b (rot y-90 → length along a's thickness z). Corner cube
  // R = x[2.25,3]×y[-6,6]×z[-0.375,0.375] → W=12, t_b=0.75, ℓ=0.75 (through). W/p=16 → n=15
  // (tie→smaller), w_end=1.125. start='pin' → a removes 7 interior sockets (0.75 each), b the
  // 8 it keeps (two 1.125 ends + six 0.75). Bands tile R → complement invariant.
  {
    name: 'box_joint',
    a: board({ id: 'brd_a', l: 6, w: 12, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 12, t: 0.75, pos: [2.625, 0, 1.625], rot: [0, 90, 0] }),
    removedA: 5.25 * 0.75 * 0.75, // 7 × 0.75 wide × t_b × ℓ = 2.953125
    removedB: 6.75 * 0.75 * 0.75, // (2×1.125 + 6×0.75) × t_b × ℓ = 3.796875
  },
  // Through dovetail (§4 case-side fixture): same corner cube, 1:8, ℓ=3/4 → N=5, T̄=1.5.
  // a (pin board) loses 5 tail sockets; b (tail board) loses the pins + edge half-pins.
  {
    name: 'dovetail',
    a: board({ id: 'brd_a', l: 6, w: 12, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 12, t: 0.75, pos: [2.625, 0, 1.625], rot: [0, 90, 0] }),
    removedA: 5 * 1.5 * 0.75 * 0.75, // N·T̄·ℓ·t_b = 4.21875
    removedB: 12 * 0.75 * 0.75 - 5 * 1.5 * 0.75 * 0.75, // W·ℓ·t_b − a = 2.53125
  },
  // Half-blind drawer (§4 drawer fixture): W=3, t_a=3/4, t_b=1/2, lap 3/16 → ℓ=9/16, N=2.
  // b stops at the lap wall (engagement = ℓ, no cap warning); sockets stay open on a's end.
  {
    name: 'dovetail',
    label: 'dovetail (half-blind drawer)',
    a: board({ id: 'brd_a', l: 6, w: 3, t: 0.75, pos: [0, 0, 0] }),
    b: board({ id: 'brd_b', l: 4, w: 3, t: 0.5, pos: [2.75, 0, 1.8125], rot: [0, 90, 0] }),
    params: { variant: 'half_blind' },
    removedA: 2 * (6 / 7) * 0.5625 * 0.5, // N·T̄·ℓ·t_b ≈ 0.482143
    removedB: 3 * 0.5625 * 0.5 - 2 * (6 / 7) * 0.5625 * 0.5, // W·ℓ·t_b − a ≈ 0.361607
  },
]

describe('JointFns — removed volume (§6.1, ± 0.001 in³)', () => {
  for (const c of CASES) {
    it(`${c.label ?? c.name}: carves the analytic volume from each board`, async () => {
      const meshes = await carve(jointModel(c.a, c.b, c.name, c.params))
      expect(removedVolume(c.a, meshes.get('brd_a')!)).toBeCloseTo(c.removedA, 3)
      expect(removedVolume(c.b, meshes.get('brd_b')!)).toBeCloseTo(c.removedB, 3)
    })
  }
})

describe('JointFns — containment (§6.1: cutter ⊂ target board)', () => {
  for (const c of CASES) {
    if (c.name === 'butt') continue // butt removes nothing
    it(`${c.label ?? c.name}: every cutter sits inside its target board`, () => {
      const fn = JOINT_FNS[c.name]!
      const pair = pairSolids(c.a, c.b)
      const set = fn(pair.a, pair.b, c.params ?? {}, { model: jointModel(c.a, c.b, c.name, c.params), tol: 1 / 64 })
      const within = (cutters: typeof set.a, b: Board) => {
        const h = [b.dims.l / 2, b.dims.w / 2, b.dims.t / 2]
        for (const cut of cutters) {
          const bounds = cutterBounds(cut)
          for (let i = 0; i < 3; i++) {
            expect(bounds.min[i]).toBeGreaterThanOrEqual(-h[i] - 1e-6)
            expect(bounds.max[i]).toBeLessThanOrEqual(h[i] + 1e-6)
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

// Chunk 16: the box joint and both dovetail variants partition the corner cube exactly —
// a's fingers/sockets and b's complement tile R with no gap and no double-cut (§3/§5).
describe('box_joint / dovetail — complement (§6.1: removed_a + removed_b = W·ℓ·t_b)', () => {
  const cube = (c: Case) => {
    // R extent = the true carve volume (through box: 0.75³·… ; half-blind uses ℓ<t_a).
    // Derive it from removedA + removedB the fixtures already assert against the mesh.
    return c.removedA + c.removedB
  }
  for (const c of CASES.filter((x) => x.name === 'box_joint' || x.name === 'dovetail')) {
    it(`${c.label ?? c.name}: a + b exactly tile the corner cube`, async () => {
      const meshes = await carve(jointModel(c.a, c.b, c.name, c.params))
      const removedA = removedVolume(c.a, meshes.get('brd_a')!)
      const removedB = removedVolume(c.b, meshes.get('brd_b')!)
      expect(removedA + removedB).toBeCloseTo(cube(c), 3)
    })
  }
})

describe('box_joint / dovetail — warnings (docs/chunk16-design.md §3/§5)', () => {
  const codes = async (a: Board, b: Board, type: JointType, params: Record<string, unknown> = {}) =>
    (await evaluate(jointModel(a, b, type, params))).warnings.map((w) => w.code)

  it('a clean through box corner raises no warnings', async () => {
    const c = CASES.find((x) => x.name === 'box_joint')!
    expect(await codes(c.a, c.b, 'box_joint')).toEqual([])
  })

  it('a box corner short of the outer face warns BOX_NOT_THROUGH (carves anyway)', async () => {
    // b penetrates only part of a's thickness (z engagement < t_a).
    const a = board({ id: 'brd_a', l: 6, w: 12, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 12, t: 0.75, pos: [2.625, 0, 2.2], rot: [0, 90, 0] })
    expect(await codes(a, b, 'box_joint')).toContain('BOX_NOT_THROUGH')
  })

  it('a clean through dovetail raises no warnings', async () => {
    const c = CASES.find((x) => x.name === 'dovetail' && !x.label)!
    expect(await codes(c.a, c.b, 'dovetail')).toEqual([])
  })

  it('a through dovetail short of the show face warns DOVETAIL_NOT_THROUGH', async () => {
    const a = board({ id: 'brd_a', l: 6, w: 12, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 12, t: 0.75, pos: [2.625, 0, 2.2], rot: [0, 90, 0] })
    expect(await codes(a, b, 'dovetail')).toContain('DOVETAIL_NOT_THROUGH')
  })

  it('a half-blind drawer that seats past the lap warns DOVETAIL_LAP_CAPPED', async () => {
    // b reaches a's full thickness (engagement = t_a) so the lap must cap the sockets.
    const a = board({ id: 'brd_a', l: 6, w: 3, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 3, t: 0.5, pos: [2.75, 0, 1.625], rot: [0, 90, 0] })
    expect(await codes(a, b, 'dovetail', { variant: 'half_blind' })).toContain('DOVETAIL_LAP_CAPPED')
  })

  it('a too-steep dovetail is rejected (no carve) with a teaching reason', async () => {
    const a = board({ id: 'brd_a', l: 6, w: 3, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 3, t: 0.75, pos: [2.625, 0, 1.625], rot: [0, 90, 0] })
    const { boards, warnings } = await evaluate(jointModel(a, b, 'dovetail', { slope: '1:1' }))
    expect(warnings.map((w) => w.code)).toContain('JOINT_PRECONDITION_FAILED')
    // No cutters applied → both boards are full base solids.
    const meshes = new Map(boards.map((x) => [x.id, x.mesh]))
    expect(meshVolume(meshes.get('brd_a')!.positions)).toBeCloseTo(6 * 3 * 0.75, 3)
  })
})

describe('JointFns — idempotence & valid meshes (§6.1)', () => {
  for (const c of CASES) {
    it(`${c.label ?? c.name}: twice → bit-identical, all normals unit length`, async () => {
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

  it('a clean through tenon raises no warnings', async () => {
    const c = await codes(stile(), rail())
    expect(c).toEqual([])
  })

  // ── chunk 12 (docs/chunk12-design.md) ──────────────────────────────────────
  it('haunch + matching groove: carved silently (the §3.4 live derivation)', async () => {
    const c = await codes(frameStile(), frameRail(), { haunch: 'square' })
    expect(c).toEqual([])
  })

  it('haunch on a groove-less stile warns HAUNCH_NO_GROOVE (still carved)', async () => {
    const c = await codes(frameStile([]), frameRail(), { haunch: 'square' })
    expect(c).toContain('HAUNCH_NO_GROOVE')
  })

  it('haunch stub that will not seat in the groove warns HAUNCH_GROOVE_MISMATCH', async () => {
    const off = frameStile([{ ...PANEL_GROOVE, offset: 0.25 }])
    const c = await codes(off, frameRail(), { haunch: 'square' })
    expect(c).toContain('HAUNCH_GROOVE_MISMATCH')
  })

  it('sloped haunch cannot fill a groove run-out → HAUNCH_GROOVE_MISMATCH', async () => {
    const c = await codes(frameStile(), frameRail(), { haunch: 'sloped' })
    expect(c).toContain('HAUNCH_GROOVE_MISMATCH')
  })

  it('wedged on a blind mortise warns WEDGE_NEEDS_THROUGH and skips the flare', async () => {
    const c = await codes(stile(), rail(), { wedged: true, through: false, depth: 1.0 })
    expect(c).toContain('WEDGE_NEEDS_THROUGH')
  })

  it('drawbore pin past a shallow mortise warns DRAWBORE_NO_ROOM', async () => {
    const c = await codes(stile(), rail(), { drawbore: true, through: false, depth: 0.6, pin_dia: 0.5 })
    expect(c).toContain('DRAWBORE_NO_ROOM')
  })

  it('a fitting drawbore raises no warnings (markers + notes only, no carve)', async () => {
    const c = await codes(stile(), rail(), { drawbore: true })
    expect(c).toEqual([])
  })

  it('twin on a narrow rail warns THIN_MORTISE_WALL for the web', async () => {
    // usable width = 1.4 − 0.75 shoulders = 0.65 → ~0.217 web after thirds (< 1/4).
    const narrow = board({ id: 'brd_b', l: 4, w: 1.4, t: 1.5, pos: [0, 0.7, 1.25], rot: [0, 90, 0] })
    const c = await codes(stile(), narrow, { twin: true })
    expect(c).toContain('THIN_MORTISE_WALL')
  })
})

// Chunk 12 placement: the derived bands land where the design doc says they do.
describe('mortise_tenon — chunk 12 placement', () => {
  const ctx = (a: Board, b: Board) => ({ model: jointModel(a, b, 'mortise_tenon'), tol: 1 / 64 })
  const fn = JOINT_FNS['mortise_tenon']!

  it('square haunch: socket sits in the groove channel; mortise stops at the band', () => {
    // Stile is unrotated at the origin, so pair frame = board frame = world.
    const a = frameStile()
    const b = frameRail()
    const pair = pairSolids(a, b)
    const set = fn(pair.a, pair.b, { haunch: 'square' }, ctx(a, b))
    const feats = set.a.map((c) => c.feature)
    expect(feats).toEqual(['mortise', 'haunch'])
    const mortise = cutterBounds(set.a[0])
    expect(mortise.min[0]).toBeCloseTo(9.375, 5) // far shoulder 3/8 off R.min = 9
    expect(mortise.max[0]).toBeCloseTo(11.34375, 5) // haunch band starts (12 − U/4)
    const socket = cutterBounds(set.a[1])
    expect(socket.min[0]).toBeCloseTo(11.34375, 5)
    expect(socket.max[0]).toBeCloseTo(12, 5) // runs to the stile's end
    expect(socket.min[1]).toBeCloseTo(1.25 - 0.375, 5) // groove depth into the edge
    expect(socket.max[1]).toBeCloseTo(1.25, 5)
    expect(socket.min[2]).toBeCloseTo(-0.125, 5) // = the groove's 1/4 slot band
    expect(socket.max[2]).toBeCloseTo(0.125, 5)
  })

  it('wedged: kerfs stop 1/2 short of the shoulder, inside each tenon', () => {
    const a = board({ id: 'brd_a', l: 4, w: 4, t: 1.5, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 4, w: 3, t: 1.5, pos: [0, 0, 1.25], rot: [0, 90, 0] })
    const pair = pairSolids(a, b)
    const set = fn(pair.a, pair.b, { wedged: true }, ctx(a, b))
    const kerfs = set.b.filter((c) => c.feature === 'kerf').map(cutterBounds)
    expect(kerfs).toHaveLength(2)
    for (const k of kerfs) {
      // b is rotated y-90: insertion lands on b-local x — shoulder line at local 0.5,
      // tenon end at local +2 (b's end face).
      expect(k.min[0]).toBeCloseTo(1.0, 5) // stops 1/2 short of the shoulder line
      expect(k.max[0]).toBeCloseTo(2.0, 5) // runs out the tenon end
      expect(k.max[1] - k.min[1]).toBeCloseTo(1 / 16, 5) // saw kerf, spread axis
    }
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
    const dado = cutterBounds(set.a[0])
    // Cutter max Z = +t_a/2 = 0.375 (flush with a's top face — overcut opens it at carve time).
    expect(dado.max[2]).toBeCloseTo(0.375, 5)
    // Cutter depth = t_a/3 = 0.25, so min Z = 0.375 − 0.25 = 0.125 (interior wall, stays exact).
    expect(dado.min[2]).toBeCloseTo(0.125, 5)
  })

  it('rabbet: L-notch is on the right face AND edge of a', () => {
    // a=24×6×0.75 at origin, b contacts the +Y edge from +Z side.
    // depth (t_a/2=0.375) cut into +Z face; width (t_b=0.5) strip at +Y edge.
    const c = CASES.find((x) => x.name === 'rabbet')!
    const fn = JOINT_FNS['rabbet']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'rabbet'))
    expect(set.a).toHaveLength(1)
    const notch = cutterBounds(set.a[0])
    expect(notch.max[2]).toBeCloseTo(0.375, 5)  // +Z face (depth axis)
    expect(notch.min[2]).toBeCloseTo(0, 5)       // depth = t_a/2, so 0.375−0.375=0
    expect(notch.max[1]).toBeCloseTo(3, 5)       // +Y edge (w_a/2=3, where b sits)
    expect(notch.min[1]).toBeCloseTo(2.5, 5)     // width = t_b=0.5, so 3−0.5=2.5
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
    expect(cutterBounds(set.a[0]).min[2]).toBeCloseTo(-0.375, 5)
    expect(cutterBounds(set.a[0]).max[2]).toBeCloseTo(0, 5)
    // b (rotated 90° around Z): in b's local frame the cutter is the top half in local Z.
    expect(cutterBounds(set.b[0]).min[2]).toBeCloseTo(0, 5)
    expect(cutterBounds(set.b[0]).max[2]).toBeCloseTo(0.375, 5)
  })

  it('bridle: slot is centred in thickness and reaches a\'s end face', () => {
    // a=6×2×1 at [−3,0,0]. The overlap is at a's right end (+X face).
    // Tenon = snap(1/3 * 1, 1/8) = 0.375. Slot centred: Z:[−0.1875, +0.1875].
    const c = CASES.find((x) => x.name === 'bridle')!
    const fn = JOINT_FNS['bridle']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'bridle'))
    expect(set.a).toHaveLength(1)
    const slot = cutterBounds(set.a[0])
    // Slot reaches a's +X end face (halfL = 3).
    expect(slot.max[0]).toBeCloseTo(3, 5)
    // Slot is centred in Z: midpoint ≈ 0.
    expect((slot.min[2] + slot.max[2]) / 2).toBeCloseTo(0, 5)
    // Tenon thickness = 0.375 → slot extent in Z = 0.375.
    expect(slot.max[2] - slot.min[2]).toBeCloseTo(0.375, 5)
  })

  it('mortise_tenon: mortise is centred in a\'s thickness and runs full depth (through)', () => {
    // a=4×4×1.5 at origin. b enters along Z; tAxis=X; tenonThk=snap(0.5,1/16)=0.5.
    // Mortise: X:[−0.25,+0.25] (centred), Z:[−0.75,+0.75] (through).
    const c = CASES.find((x) => x.name === 'mortise_tenon')!
    const fn = JOINT_FNS['mortise_tenon']!
    const pair = pairSolids(c.a, c.b)
    const set = fn(pair.a, pair.b, {}, ctx(c.a, c.b, 'mortise_tenon'))
    expect(set.a).toHaveLength(1)
    const mortise = cutterBounds(set.a[0])
    // Centred in a's thickness axis (X): ±tenonThk/2 = ±0.25.
    expect(mortise.min[0]).toBeCloseTo(-0.25, 5)
    expect(mortise.max[0]).toBeCloseTo(0.25, 5)
    // Through mortise: full Z extent of a = ±t_a/2 = ±0.75.
    expect(mortise.min[2]).toBeCloseTo(-0.75, 5)
    expect(mortise.max[2]).toBeCloseTo(0.75, 5)
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
  it('warns JOINT_FEATURE_UNIMPLEMENTED for the still-deferred miter (§5.9, v1.5)', async () => {
    const a = board({ id: 'brd_a', l: 6, w: 4, t: 0.75, pos: [0, 0, 0] })
    const b = board({ id: 'brd_b', l: 6, w: 4, t: 0.75, pos: [0, 4, 0] })
    const { warnings } = await evaluate(jointModel(a, b, 'miter'))
    expect(warnings.map((w) => w.code)).toContain('JOINT_FEATURE_UNIMPLEMENTED')
  })

  it('box_joint and dovetail now CARVE (no JOINT_FEATURE_UNIMPLEMENTED) — chunk 16', async () => {
    for (const c of CASES.filter((x) => x.name === 'box_joint' || x.name === 'dovetail')) {
      const { warnings } = await evaluate(jointModel(c.a, c.b, c.name, c.params))
      expect(warnings.map((w) => w.code)).not.toContain('JOINT_FEATURE_UNIMPLEMENTED')
    }
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
