// Per-board carve memo (docs/chunk9-design.md §8). evaluate(model, cache) reuses a
// board's prior mesh when the carve key — board dims + cutter boxes — is unchanged,
// skipping the Manifold carve. These tests assert the memo's correctness: what gets
// reused, what gets re-carved, and that pruning keeps the cache bounded.
//
// Reuse is asserted by mesh-instance identity (===): a cache hit returns the exact
// EvalMesh object stored on the prior eval, so === is the ground truth for "skipped the
// carve". A re-carve returns a fresh object (!==).
import { describe, it, expect } from 'vitest'
import { board, meshVolume } from './fixtures.js'
import { ModelSchema, type Model } from '../../model.js'
import { JointSchema } from '../../joint.js'
import type { Board } from '../../board.js'
import { evaluate, createEvalCache } from '../evaluate.js'

const META = { created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' }

// A rail (A) and a rung (B) crossing → a half_lap (both get cutters), plus a standalone
// joint-free board (C) far away. Lets us isolate "participant changed" from "bystander".
function makeModel(over: { a?: Partial<Board>; b?: Partial<Board>; c?: Partial<Board>; split?: number } = {}): Model {
  const a = { ...board({ id: 'brd_a', l: 12, w: 2, t: 1, pos: [0, 0, 0] }), ...over.a }
  const b = { ...board({ id: 'brd_b', l: 6, w: 2, t: 1, pos: [0, 0, 0], rot: [0, 0, 90] }), ...over.b }
  const c = { ...board({ id: 'brd_c', l: 4, w: 4, t: 1, pos: [100, 0, 0] }), ...over.c }
  return ModelSchema.parse({
    id: 'mdl_memo',
    rev: 0,
    name: 'memo-test',
    boards: [a, b, c],
    joints: [
      JointSchema.parse({ id: 'jnt_lap', a: 'brd_a', b: 'brd_b', type: 'half_lap', params: over.split != null ? { split: over.split } : {} }),
    ],
    groups: [],
    meta: META,
  })
}

const byId = (boards: { id: string; mesh: unknown }[], id: string) => boards.find((x) => x.id === id)!.mesh

describe('per-board carve memo', () => {
  it('reuses every board when the model is unchanged (all cache hits)', async () => {
    const cache = createEvalCache()
    const model = makeModel()
    const first = await evaluate(model, cache)
    const second = await evaluate(model, cache)
    for (const { id } of first.boards) {
      expect(byId(second.boards, id)).toBe(byId(first.boards, id)) // same instance → carve skipped
    }
  })

  it('treats moving a joint-free board as a cache hit (the carve is board-LOCAL)', async () => {
    const cache = createEvalCache()
    const first = await evaluate(makeModel(), cache)
    // C has no joints, so its cutter set is empty regardless of position: its local box
    // mesh is identical wherever it sits (R3F applies the world transform). Cache hit.
    const moved = await evaluate(makeModel({ c: { transform: { pos: [250, 30, 5], rot: [0, 0, 0] } } }), cache)
    expect(byId(moved.boards, 'brd_c')).toBe(byId(first.boards, 'brd_c'))
    // And the reused mesh is geometrically correct — equals a cache-free carve.
    const fresh = await evaluate(makeModel({ c: { transform: { pos: [250, 30, 5], rot: [0, 0, 0] } } }))
    expect(meshVolume((byId(moved.boards, 'brd_c') as { positions: Float32Array }).positions)).toBeCloseTo(
      meshVolume((byId(fresh.boards, 'brd_c') as { positions: Float32Array }).positions),
      6,
    )
  })

  it('re-carves only the board whose dims changed; bystanders reused', async () => {
    const cache = createEvalCache()
    const first = await evaluate(makeModel(), cache)
    // C is standalone, so changing only its dims touches nothing else.
    const next = await evaluate(makeModel({ c: { dims: { l: 8, w: 4, t: 1 } } }), cache)
    expect(byId(next.boards, 'brd_c')).not.toBe(byId(first.boards, 'brd_c')) // re-carved
    expect(byId(next.boards, 'brd_a')).toBe(byId(first.boards, 'brd_a')) // reused
    expect(byId(next.boards, 'brd_b')).toBe(byId(first.boards, 'brd_b')) // reused
  })

  it('re-carves both joint participants when the joint changes; bystander reused', async () => {
    const cache = createEvalCache()
    const first = await evaluate(makeModel(), cache)
    // A different split moves the lap's cut plane → both A's and B's cutters change.
    const next = await evaluate(makeModel({ split: 0.3 }), cache)
    expect(byId(next.boards, 'brd_a')).not.toBe(byId(first.boards, 'brd_a')) // re-carved
    expect(byId(next.boards, 'brd_b')).not.toBe(byId(first.boards, 'brd_b')) // re-carved
    expect(byId(next.boards, 'brd_c')).toBe(byId(first.boards, 'brd_c')) // reused
  })

  it('prunes cache entries for boards removed from the model', async () => {
    const cache = createEvalCache()
    await evaluate(makeModel(), cache)
    expect(cache.boards.size).toBe(3)
    const twoBoards = makeModel() // the half_lap (a,b) stays valid; just drop board C
    twoBoards.boards = twoBoards.boards.filter((b) => b.id !== 'brd_c')
    await evaluate(twoBoards, cache)
    expect(cache.boards.size).toBe(2)
    expect(cache.boards.has('brd_c')).toBe(false)
    expect(cache.boards.has('brd_a')).toBe(true)
  })
})
