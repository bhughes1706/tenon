// Analytic collision pass (§6 step 4) — the AUTHORITY for UNRESOLVED_COLLISION,
// run identically on the server (op-validation) and the client (instant optimistic
// lint). Ported from chunk 8's web/src/lib/collision.ts, now in core so there is a
// single source (docs/chunk9-design.md §1c).
//
// No Manifold: the per-pair test goes through a narrowphase() seam. Two axis-aligned
// boards use the cheap exact AABB-volume path; any other pair uses exact OBB-OBB SAT
// (obbOverlap) — correct at ANY rotation, not just 90°-multiples (§Angle readiness).

import type { Model } from '../model.js'
import type { Board } from '../board.js'
import type { Warning } from '../common.js'
import { worldAABB, worldOBB, intersectVolume, isAxisAligned, obbOverlap } from './aabb.js'
import { checkJointPrecondition } from './preconditions.js'

// Positive-overlap epsilon: flush contact (a shelf on a side, a butt joint — zero
// penetration) must NOT flag; only a real intersection volume does (§2.4 #2, §6 step 4).
export const COLLISION_VOL_EPS = 1e-6 // in³

export interface Narrowphase {
  intersects: boolean
  volume: number
}

// Fast exact path when both boards are 90°-multiple aligned (AABB IS the true
// footprint); exact OBB-SAT otherwise. `volume` for the SAT path is depth³, an
// approximation (true clipped volume needs polytope clipping) — good enough to rank
// severity; only `intersects` is load-bearing for UNRESOLVED_COLLISION.
export function narrowphase(a: Board, b: Board): Narrowphase {
  if (isAxisAligned(a) && isAxisAligned(b)) {
    const volume = intersectVolume(worldAABB(a), worldAABB(b))
    return { intersects: volume > COLLISION_VOL_EPS, volume }
  }
  const { intersects, depth } = obbOverlap(worldOBB(a), worldOBB(b))
  return { intersects, volume: intersects ? depth ** 3 : 0 }
}

const governed = (model: Model, a: string, b: string): boolean =>
  model.joints.some(
    (j) => j.enabled !== false && ((j.a === a && j.b === b) || (j.a === b && j.b === a)),
  )

// The model-level analytic lint pass, run on EVERY model set (client optimistic edits,
// server post-commit) so both signals below are persistent — they describe the model's
// current state, not the op that caused it:
//   1. UNRESOLVED_COLLISION — pairwise penetration with no governing enabled joint
//      (the §2.4 joint-completeness signal).
//   2. JOINT_PRECONDITION_FAILED — an enabled joint whose boards no longer satisfy its
//      "requires" row (§2.4 #3): moved apart, engagement too shallow, or rotated to a
//      compound angle. Previously only warned transiently by validateOps in the batch
//      that moved the board; deriving it here keeps the lint alive across later edits.
// O(n² + j); trivial at the spec's ≤100-board target.
export function recomputeWarnings(model: Model | null): Warning[] {
  if (!model) return []
  const { boards } = model

  const warnings: Warning[] = []
  for (let i = 0; i < boards.length; i++) {
    for (let k = i + 1; k < boards.length; k++) {
      if (!narrowphase(boards[i], boards[k]).intersects) continue
      if (governed(model, boards[i].id, boards[k].id)) continue
      warnings.push({
        code: 'UNRESOLVED_COLLISION',
        boards: [boards[i].id, boards[k].id],
        msg: `${boards[i].name} overlaps ${boards[k].name} with no joint — resolve as a joint or move them apart.`,
      })
    }
  }

  const byId = new Map(boards.map((b: Board) => [b.id, b]))
  for (const j of model.joints) {
    if (j.enabled === false) continue
    const a = byId.get(j.a)
    const b = byId.get(j.b)
    if (!a || !b) continue // dangling reference; remove_board cascade owns this
    const res = checkJointPrecondition(j.type, a, b, (j.params ?? {}) as Record<string, unknown>)
    if (!res.ok) {
      warnings.push({
        code: 'JOINT_PRECONDITION_FAILED',
        joints: [j.id],
        boards: [j.a, j.b],
        msg: res.reason ?? `${j.type} no longer satisfies its requirements.`,
      })
    }
  }
  return warnings
}
