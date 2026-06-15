// Stage 3 evaluator tests (docs/chunk9-design.md §7): base solids + edge grooves.
// Manifold WASM inits in-process under vitest (the §11 step-1 spike proved it loads).
// Joint golden/property suites land with the JointFns in stage 4.
import { describe, it, expect } from 'vitest'
import { ModelSchema, type Model } from '../../model.js'
import { BoardSchema } from '../../board.js'
import { evaluate } from '../evaluate.js'
import type { EvalMesh } from '../types.js'

const META = { created_at: '2026-06-14T00:00:00Z', updated_at: '2026-06-14T00:00:00Z' }

function modelWith(...boards: unknown[]): Model {
  return ModelSchema.parse({
    id: 'mdl_test000000',
    rev: 0,
    name: 'eval-test',
    boards: boards.map((b) => BoardSchema.parse(b)),
    joints: [],
    groups: [],
    meta: META,
  })
}

const PLAIN_BOARD = {
  id: 'brd_plain00000',
  name: 'Plain',
  dims: { l: 30, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
}

// Signed mesh volume from de-indexed triangle-soup positions (∑ p0·(p1×p2) / 6).
function meshVolume(positions: Float32Array): number {
  let v = 0
  for (let o = 0; o < positions.length; o += 9) {
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2]
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5]
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8]
    const crx = by * cz - bz * cy
    const cry = bz * cx - bx * cz
    const crz = bx * cy - by * cx
    v += ax * crx + ay * cry + az * crz
  }
  return v / 6
}

function maxNormalError(mesh: EvalMesh): number {
  let worst = 0
  for (let o = 0; o < mesh.normals.length; o += 3) {
    const m = Math.hypot(mesh.normals[o], mesh.normals[o + 1], mesh.normals[o + 2])
    worst = Math.max(worst, Math.abs(m - 1))
  }
  return worst
}

describe('evaluate — base solids', () => {
  it('carves a plain board to its analytic volume with a valid de-indexed mesh', async () => {
    const { boards, warnings } = await evaluate(modelWith(PLAIN_BOARD))
    expect(warnings).toEqual([])
    expect(boards).toHaveLength(1)
    const { id, mesh } = boards[0]
    expect(id).toBe('brd_plain00000')

    // de-indexed triangle soup: 3 verts per triangle, no index buffer
    const triCount = mesh.positions.length / 9
    expect(mesh.normals.length).toBe(mesh.positions.length)
    expect(mesh.provenance.length).toBe(triCount)

    // volume = l·w·t (the mesh is in board-local frame, centred at origin)
    expect(meshVolume(mesh.positions)).toBeCloseTo(30 * 2.5 * 0.75, 3)
    // all normals unit length
    expect(maxNormalError(mesh)).toBeLessThan(1e-4)
    // no joints/grooves → every face is the base feature
    expect(mesh.features).toEqual([{ id: 0, kind: 'base' }])
    expect(Array.from(mesh.provenance).every((p) => p === 0)).toBe(true)
  })

  it('is idempotent — evaluating twice yields bit-identical meshes (kernel-drift guard)', async () => {
    const m = modelWith(PLAIN_BOARD)
    const a = (await evaluate(m)).boards[0].mesh
    const b = (await evaluate(m)).boards[0].mesh
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions))
    expect(Array.from(a.normals)).toEqual(Array.from(b.normals))
    expect(Array.from(a.provenance)).toEqual(Array.from(b.provenance))
  })
})

describe('evaluate — edge grooves (§3.4)', () => {
  const GROOVED = {
    ...PLAIN_BOARD,
    id: 'brd_grooved000',
    edge_grooves: [{ id: 'egv_top0000000', edge: 'top', depth: 0.25, width: 0.25, offset: 0 }],
  }

  it('removes a top groove and tags its faces with a groove CutFeature', async () => {
    const { boards } = await evaluate(modelWith(GROOVED))
    const mesh = boards[0].mesh

    // a 0.25×0.25 slot the full 30" length → removes 30·0.25·0.25 = 1.875 in³
    const base = 30 * 2.5 * 0.75
    expect(meshVolume(mesh.positions)).toBeCloseTo(base - 1.875, 2)

    // feature table has exactly base + groove; both are represented in provenance
    // (catches a kernel bump that collapses all originalIDs to one value)
    expect(mesh.features).toEqual([
      { id: 0, kind: 'base' },
      { id: 1, kind: 'groove', jointId: undefined },
    ])
    const prov = Array.from(mesh.provenance)
    expect(prov.some((p) => p === 0)).toBe(true) // base faces present
    expect(prov.some((p) => p === 1)).toBe(true) // groove faces present
    expect(maxNormalError(mesh)).toBeLessThan(1e-4)
  })
})
