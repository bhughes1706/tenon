// Shared fixtures + mesh measurements for the joint suites (docs/chunk9-design.md §7).
// Every fixture is a 2-board model with one joint; all boards are 90°-aligned (v1, §12)
// and positioned to genuinely overlap so the step-3 precondition accepts the joint
// (gotcha: non-overlapping boards are rejected).
import { ModelSchema, type Model } from '../../model.js'
import { BoardSchema, type Board } from '../../board.js'
import { JointSchema, type JointType } from '../../joint.js'
import type { EvalMesh } from '../types.js'

const META = { created_at: '2026-06-15T00:00:00Z', updated_at: '2026-06-15T00:00:00Z' }
const SPECIES = 'spc_red_oak'

type BoardSpec = {
  id: string
  l: number
  w: number
  t: number
  pos: [number, number, number]
  rot?: [number, number, number]
  edge_grooves?: unknown[]
  edge_profiles?: unknown[]
}

export function board(spec: BoardSpec): Board {
  return BoardSchema.parse({
    id: spec.id,
    name: spec.id,
    dims: { l: spec.l, w: spec.w, t: spec.t },
    species: SPECIES,
    transform: { pos: spec.pos, rot: spec.rot ?? [0, 0, 0] },
    edge_grooves: spec.edge_grooves ?? [],
    edge_profiles: spec.edge_profiles ?? [],
  })
}

// A one-board model — for board-level features (edge grooves, edge profiles) that need
// no joint partner.
export function boardModel(b: Board): Model {
  return ModelSchema.parse({
    id: 'mdl_boardtest',
    rev: 0,
    name: 'board-test',
    boards: [b],
    joints: [],
    groups: [],
    meta: META,
  })
}

export function jointModel(
  a: Board,
  b: Board,
  type: JointType,
  params: Record<string, unknown> = {},
): Model {
  return ModelSchema.parse({
    id: 'mdl_jointtest',
    rev: 0,
    name: `${type}-test`,
    boards: [a, b],
    joints: [JointSchema.parse({ id: 'jnt_x', a: a.id, b: b.id, type, params })],
    groups: [],
    meta: META,
  })
}

// Signed volume of a de-indexed triangle-soup mesh (∑ p0·(p1×p2) / 6).
export function meshVolume(positions: Float32Array): number {
  let v = 0
  for (let o = 0; o < positions.length; o += 9) {
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2]
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5]
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8]
    v += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
  }
  return v / 6
}

// Volume removed from a board = its analytic box volume − the carved mesh volume.
export function removedVolume(b: Board, mesh: EvalMesh): number {
  return b.dims.l * b.dims.w * b.dims.t - meshVolume(mesh.positions)
}

export function maxNormalError(mesh: EvalMesh): number {
  let worst = 0
  for (let o = 0; o < mesh.normals.length; o += 3) {
    const m = Math.hypot(mesh.normals[o], mesh.normals[o + 1], mesh.normals[o + 2])
    worst = Math.max(worst, Math.abs(m - 1))
  }
  return worst
}

// Local-frame bounding box of a mesh's positions, rounded — for golden snapshots.
export function meshBBox(mesh: EvalMesh): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let o = 0; o < mesh.positions.length; o += 3) {
    for (let k = 0; k < 3; k++) {
      const p = mesh.positions[o + k]
      if (p < min[k]) min[k] = p
      if (p > max[k]) max[k] = p
    }
  }
  const r = (n: number) => Math.round(n * 10000) / 10000
  return { min: min.map(r), max: max.map(r) }
}

export const triCount = (mesh: EvalMesh): number => mesh.positions.length / 9
