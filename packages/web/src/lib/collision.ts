import * as THREE from 'three'
import type { Model, Board, Warning } from '@tenon/core'
import type { AABB } from '../viewport/snapping.js'

// Chunk 8 collision *broadphase* (§6 step 4). Pairwise AABB penetration → an
// UNRESOLVED_COLLISION lint per pair not governed by a joint. Exact for v1 because
// rotations are 90° multiples (§12), so a board's world AABB is its true footprint.
//
// The Manifold *narrowphase* (true intersection volume) lands in chunk 9 and runs
// server-side; at that point OpResult.warnings becomes authoritative and the store
// stops calling this. Until then this client-side pass keeps lint live during
// optimistic edits with no server round-trip.

const deg2rad = (d: number) => (d * Math.PI) / 180

// Flush contact (a shelf resting on a side, a butt joint — zero penetration) must
// NOT flag; only real interpenetration is a collision (§2.4 #2). Small float margin.
export const COLLISION_EPS = 0.005 // inches

export function worldAABB(board: Board): AABB {
  // Same corner-rotation as viewport/bounds.ts — keep them consistent.
  const [px, py, pz] = board.transform.pos
  const [rx, ry, rz] = board.transform.rot
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg2rad(rx), deg2rad(ry), deg2rad(rz), 'XYZ'))
  const hl = board.dims.l / 2
  const hw = board.dims.w / 2
  const ht = board.dims.t / 2
  const v = new THREE.Vector3()
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        v.set(sx * hl, sy * hw, sz * ht).applyQuaternion(q)
        const x = v.x + px, y = v.y + py, z = v.z + pz
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (z < minZ) minZ = z
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        if (z > maxZ) maxZ = z
      }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
}

// True only when the two boxes overlap on all three axes by more than EPS.
export function penetrates(a: AABB, b: AABB): boolean {
  for (let i = 0; i < 3; i++) {
    const overlap = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])
    if (overlap <= COLLISION_EPS) return false
  }
  return true
}

export function recomputeWarnings(model: Model | null): Warning[] {
  if (!model || model.boards.length < 2) return []
  const { boards } = model
  const aabbs = boards.map(worldAABB)
  const governed = (a: string, b: string) =>
    model.joints.some(
      (j) => j.enabled !== false && ((j.a === a && j.b === b) || (j.a === b && j.b === a)),
    )

  const warnings: Warning[] = []
  for (let i = 0; i < boards.length; i++) {
    for (let k = i + 1; k < boards.length; k++) {
      if (!penetrates(aabbs[i], aabbs[k])) continue
      if (governed(boards[i].id, boards[k].id)) continue
      warnings.push({
        code: 'UNRESOLVED_COLLISION',
        boards: [boards[i].id, boards[k].id],
        msg: `${boards[i].name} overlaps ${boards[k].name} with no joint — resolve as a joint or move them apart.`,
      })
    }
  }
  return warnings
}
