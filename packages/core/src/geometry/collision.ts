// Analytic collision pass (§6 step 4) — the AUTHORITY for UNRESOLVED_COLLISION,
// run identically on the server (op-validation) and the client (instant optimistic
// lint). Ported from chunk 8's web/src/lib/collision.ts, now in core so there is a
// single source (docs/chunk9-design.md §1c).
//
// No Manifold: the per-pair test goes through a narrowphase() seam whose v1 body is
// analytic AABB-overlap volume. EXACT for 90° boards (§12). Swapping in OBB-SAT or a
// Manifold CSG intersection later touches only narrowphase() — no call site assumes
// AABB (§Angle readiness).

import type { Model } from '../model.js'
import type { Board } from '../board.js'
import type { Warning } from '../common.js'
import { worldAABB, intersectVolume, isAxisAligned, type AABB } from './aabb.js'

// Positive-overlap epsilon: flush contact (a shelf on a side, a butt joint — zero
// penetration) must NOT flag; only a real intersection volume does (§2.4 #2, §6 step 4).
export const COLLISION_VOL_EPS = 1e-6 // in³

export interface Narrowphase {
  intersects: boolean
  volume: number
}

// v1: analytic AABB intersection volume. The seam later swaps to OBB-SAT / CSG.
export function narrowphase(a: AABB, b: AABB): Narrowphase {
  const volume = intersectVolume(a, b)
  return { intersects: volume > COLLISION_VOL_EPS, volume }
}

const governed = (model: Model, a: string, b: string): boolean =>
  model.joints.some(
    (j) => j.enabled !== false && ((j.a === a && j.b === b) || (j.a === b && j.b === a)),
  )

// Pairwise penetration → one UNRESOLVED_COLLISION per overlapping pair NOT governed
// by an enabled joint (the §2.4 joint-completeness signal). O(n²); trivial at the
// spec's ≤100-board target.
export function recomputeWarnings(model: Model | null): Warning[] {
  if (!model || model.boards.length < 2) return []
  const { boards } = model
  const aabbs: AABB[] = boards.map((b: Board) => worldAABB(b))

  const warnings: Warning[] = []
  for (let i = 0; i < boards.length; i++) {
    for (let k = i + 1; k < boards.length; k++) {
      if (!narrowphase(aabbs[i], aabbs[k]).intersects) continue
      if (governed(model, boards[i].id, boards[k].id)) continue
      // AABB narrowphase is only exact for 90°-multiple rotations (§1d). For off-axis
      // boards the AABB is conservative (over-reports), so skip UNRESOLVED_COLLISION to
      // avoid false positives. A console note keeps the door open without asserting.
      if (!isAxisAligned(boards[i]) || !isAxisAligned(boards[k])) {
        console.warn(
          `[geometry] ${boards[i].name} or ${boards[k].name} is off-axis — collision check is approximate; skipping UNRESOLVED_COLLISION`,
        )
        continue
      }
      warnings.push({
        code: 'UNRESOLVED_COLLISION',
        boards: [boards[i].id, boards[k].id],
        msg: `${boards[i].name} overlaps ${boards[k].name} with no joint — resolve as a joint or move them apart.`,
      })
    }
  }
  return warnings
}
