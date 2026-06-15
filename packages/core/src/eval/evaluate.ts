// The geometry evaluator pipeline (docs/chunk9-design.md §2d, §6).
//
// Stage 3 scope: base solids + edge grooves only — joint cutters land with the six
// JointFns in stage 4. The shape is already the full pipeline: per board, build the
// base solid, collect cutter boxes, ONE batched subtract(union(cutters)), extract an
// indexed mesh + per-face provenance. Joints will just add to `cutterBoxes`.
//
// Every Manifold WASM object is freed after getMesh() (getMesh forces evaluation
// first), so a re-eval doesn't leak the kernel heap.
import type { Manifold } from 'manifold-3d'
import { getManifold } from './manifold.js'
import type { Board } from '../board.js'
import type { Model } from '../model.js'
import type { Warning } from '../common.js'
import type { CutFeature, CutterBox, EvalMesh, EvalResult } from './types.js'
import { baseSolid, buildCutter, edgeGrooveCutters } from './solids.js'
import { toEvalMesh } from './mesh.js'

type ManifoldStatic = Parameters<typeof buildCutter>[0]

export async function evaluate(model: Model): Promise<EvalResult> {
  const { Manifold } = await getManifold()
  const boards: { id: string; mesh: EvalMesh }[] = []
  // Joint-geometry warnings (THIN_TENON, …) attach here in stage 4. Collision +
  // precondition warnings stay analytic in @tenon/core (server-authoritative).
  const warnings: Warning[] = []

  for (const board of model.boards) {
    boards.push({ id: board.id, mesh: evaluateBoard(Manifold, board) })
  }

  return { boards, warnings }
}

// Carve one board in its local frame. Owns all WASM lifetimes via `trash`.
function evaluateBoard(M: ManifoldStatic, board: Board): EvalMesh {
  const trash: Manifold[] = []
  try {
    const base = baseSolid(M, board)
    trash.push(base)

    const features: CutFeature[] = [{ id: 0, kind: 'base' }]
    const idToFeature = new Map<number, number>()
    idToFeature.set(base.originalID(), 0)

    const cutterBoxes: CutterBox[] = edgeGrooveCutters(board)
    const cutters: Manifold[] = []
    for (const box of cutterBoxes) {
      const featureId = features.length
      features.push({ id: featureId, kind: box.feature, jointId: box.jointId })
      const { manifold, originalId } = buildCutter(M, box)
      idToFeature.set(originalId, featureId)
      trash.push(manifold)
      cutters.push(manifold)
    }

    let solid = base
    if (cutters.length > 0) {
      const union = cutters.length === 1 ? cutters[0] : M.union(cutters)
      if (cutters.length > 1) trash.push(union)
      solid = base.subtract(union)
      trash.push(solid)
    }

    const mesh = solid.getMesh()
    return toEvalMesh(mesh, idToFeature, features)
  } finally {
    for (const m of trash) m.delete()
  }
}
