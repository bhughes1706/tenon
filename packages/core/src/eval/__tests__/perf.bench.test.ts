// Geometry-evaluator performance measurement (docs/chunk9-design.md §8). NOT a CI test:
// gated behind PERF=1 so it never runs (or flakes on timing) in the normal suite.
//
//   PERF=1 corepack pnpm --filter @tenon/core test perf.bench
//
// Builds a worst-case model at the §8 budget ceiling (≤100 boards / ≤200 joints) and
// reports four numbers against the budget (full < 250 ms, incremental < 50 ms):
//   • init        — first eval, dominated by one-time Manifold WASM init (warmed on mount)
//   • full (warm)  — full re-evaluate, no cache (post-init steady state)
//   • cached       — full re-evaluate, cache warm, nothing changed (all hits)
//   • incremental  — one board moved with a warm cache (a real drag/op)
//
// The model is `CELLS` independent g×g lattices of crossing boards (rails × stiles),
// each crossing a half_lap — every joint's precondition genuinely passes (3-dim overlap),
// and cells are spaced far apart so only the intended pairs overlap.
import { describe, it, expect } from 'vitest'
import { board } from './fixtures.js'
import { ModelSchema, type Model } from '../../model.js'
import { JointSchema } from '../../joint.js'
import type { Board } from '../../board.js'
import { evaluate, createEvalCache } from '../evaluate.js'

const META = { created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' }

const CELLS = 12
const G = 4 // → CELLS*2G = 96 boards, CELLS*G² = 192 joints
const S = 4 // spacing between parallel boards (w=2 → a 2" gap, no self-overlap)
const SPAN = G * S // rail/stile length: covers every crossing partner in its cell
const CELL_GAP = 1000 // cells far enough apart that none overlap another

function buildLattice(): Model {
  const boards: Board[] = []
  const joints: ReturnType<typeof JointSchema.parse>[] = []
  for (let c = 0; c < CELLS; c++) {
    const cx = c * CELL_GAP
    const railIds: string[] = []
    const stileIds: string[] = []
    for (let r = 0; r < G; r++) {
      const id = `brd_c${c}_r${r}`
      railIds.push(id)
      boards.push(board({ id, l: SPAN, w: 2, t: 1, pos: [cx, (r - (G - 1) / 2) * S, 0] }))
    }
    for (let s = 0; s < G; s++) {
      const id = `brd_c${c}_s${s}`
      stileIds.push(id)
      boards.push(board({ id, l: SPAN, w: 2, t: 1, pos: [cx + (s - (G - 1) / 2) * S, 0, 0], rot: [0, 0, 90] }))
    }
    for (const a of railIds) for (const b of stileIds) {
      joints.push(JointSchema.parse({ id: `jnt_${a}_${b}`, a, b, type: 'half_lap', params: {} }))
    }
  }
  return ModelSchema.parse({ id: 'mdl_perf', rev: 0, name: 'perf', boards, joints, groups: [], meta: META })
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function time(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now()
  await fn()
  return performance.now() - t
}

// Sequential repeats — the carve is CPU-bound and single-threaded, so timing runs
// concurrently (Promise.all) would stack their durations and inflate the median.
async function timeN(n: number, fn: () => Promise<unknown>): Promise<number> {
  const xs: number[] = []
  for (let i = 0; i < n; i++) xs.push(await time(fn))
  return median(xs)
}

describe.skipIf(!process.env.PERF)('evaluator performance (PERF=1)', () => {
  it(`full + incremental re-eval at ${CELLS * 2 * G} boards / ${CELLS * G * G} joints`, async () => {
    const model = buildLattice()

    const init = await time(() => evaluate(model)) // first eval pays one-time WASM init
    const full = await timeN(5, () => evaluate(model))

    const cache = createEvalCache()
    await evaluate(model, cache) // prime the cache
    const cached = await timeN(3, () => evaluate(model, cache))

    // Incremental: move one board (keeps its half_laps valid) → only it + its crossing
    // partners re-carve; the rest are cache hits.
    const moved: Model = { ...model, boards: model.boards.map((b, i) => (i === 0 ? { ...b, transform: { ...b.transform, pos: [b.transform.pos[0], b.transform.pos[1], 0.25] } } : b)) }
    const incr = await time(() => evaluate(moved, cache))

    const r = (n: number) => `${n.toFixed(1)} ms`
    // eslint-disable-next-line no-console
    console.log(
      `\n[perf] ${model.boards.length} boards / ${model.joints.length} joints` +
        `\n  init (incl. WASM init): ${r(init)}` +
        `\n  full re-eval (warm):    ${r(full)}   budget < 250 ms` +
        `\n  cached (no change):     ${r(cached)}` +
        `\n  incremental (1 moved):  ${r(incr)}   budget < 50 ms\n`,
    )

    // Sanity bound only (not a tuned threshold — this is gated out of CI): a 10×+ blow-up
    // past budget means something regressed catastrophically.
    expect(full).toBeLessThan(2500)
  })
})
