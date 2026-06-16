// The geometry evaluator pipeline (docs/chunk9-design.md §2d, §6).
//
// Per board: build the base solid, collect every cutter box (edge grooves + joint
// cutters), do ONE batched subtract(union(cutters)), extract a de-indexed mesh + a
// per-face provenance index. Joint cutters come from the §3 JointFns — pure box math in
// each board's local frame; this file is the only place those boxes become Manifold.
//
// Every Manifold WASM object is freed after getMesh() (getMesh forces evaluation
// first), so a re-eval doesn't leak the kernel heap.
import type { Manifold } from 'manifold-3d'
import { getManifold } from './manifold.js'
import type { Board } from '../board.js'
import type { Model } from '../model.js'
import type { Warning } from '../common.js'
import { WarningCode } from '../common.js'
import { worldAABB, worldOBB } from '../geometry/aabb.js'
import { checkJointPrecondition, CONTACT_TOL } from '../geometry/preconditions.js'
import type { BoardSolid, CutFeature, CutterBox, EvalCtx, EvalMesh, EvalResult } from './types.js'
import { baseSolid, buildCutter, edgeGrooveCutters, overcutToBoard } from './solids.js'
import { toEvalMesh } from './mesh.js'
import { JOINT_FNS } from './joints/index.js'

type ManifoldStatic = Parameters<typeof buildCutter>[0]

export async function evaluate(model: Model): Promise<EvalResult> {
  const { Manifold } = await getManifold()
  const warnings: Warning[] = []

  // 1. Pure-data board solids (aabb + obb in world; no WASM) for the JointFns.
  const solids = new Map<string, BoardSolid>()
  for (const board of model.boards) {
    solids.set(board.id, { board, aabb: worldAABB(board), obb: worldOBB(board) })
  }

  // 2. Seed every board's cutter list with its edge grooves (board features, §3.4),
  //    then add the joint cutters from each enabled joint's JointFn.
  const cuttersByBoard = new Map<string, CutterBox[]>()
  for (const board of model.boards) cuttersByBoard.set(board.id, edgeGrooveCutters(board))

  const ctx: EvalCtx = { model, tol: CONTACT_TOL }
  for (const joint of model.joints) {
    if (joint.enabled === false) continue
    const a = solids.get(joint.a)
    const b = solids.get(joint.b)
    if (!a || !b) continue // dangling reference; ignore

    const fn = JOINT_FNS[joint.type]
    if (!fn) {
      warnings.push({
        code: WarningCode.JOINT_FEATURE_UNIMPLEMENTED,
        joints: [joint.id],
        boards: [joint.a, joint.b],
        msg: `${joint.type} geometry is not implemented yet — the boards render uncut.`,
      })
      continue
    }

    // Re-check the precondition against current positions (a move may have invalidated an
    // existing joint, §2.4 #3). Skip the carve + warn rather than emit broken geometry.
    const pre = checkJointPrecondition(joint.type, a.board, b.board, joint.params)
    if (!pre.ok) {
      warnings.push({
        code: WarningCode.JOINT_PRECONDITION_FAILED,
        joints: [joint.id],
        boards: [joint.a, joint.b],
        msg: pre.reason ?? `${joint.type} no longer satisfies its requirements.`,
      })
      continue
    }

    const set = fn(a, b, joint.params, ctx)
    stamp(cuttersByBoard.get(joint.a), set.a, joint.id)
    stamp(cuttersByBoard.get(joint.b), set.b, joint.id)
    for (const w of set.warnings) {
      warnings.push({ ...w, joints: w.joints ?? [joint.id], boards: w.boards ?? [joint.a, joint.b] })
    }
  }

  // 3. Carve each board from its accumulated cutter boxes.
  const boards: { id: string; mesh: EvalMesh }[] = []
  for (const board of model.boards) {
    boards.push({ id: board.id, mesh: evaluateBoard(Manifold, board, cuttersByBoard.get(board.id) ?? []) })
  }

  return { boards, warnings }
}

// Tag a joint's cutters with the joint id and append them to the target board's list.
function stamp(into: CutterBox[] | undefined, cutters: CutterBox[], jointId: string): void {
  if (!into) return
  for (const c of cutters) into.push({ ...c, jointId })
}

// Carve one board in its local frame from its cutter boxes. Owns all WASM lifetimes
// via `trash`. Feature 0 is always the base; each cutter appends a CutFeature, and the
// run table maps output triangles back to the originating feature (provenance, §2e).
function evaluateBoard(M: ManifoldStatic, board: Board, cutterBoxes: CutterBox[]): EvalMesh {
  const trash: Manifold[] = []
  try {
    const base = baseSolid(M, board)
    trash.push(base)

    const features: CutFeature[] = [{ id: 0, kind: 'base' }]
    const idToFeature = new Map<number, number>()
    idToFeature.set(base.originalID(), 0)

    const cutters: Manifold[] = []
    for (const box of cutterBoxes) {
      const featureId = features.length
      features.push({ id: featureId, kind: box.feature, jointId: box.jointId })
      // Open flush faces (gotcha #4) just before the carve; interior walls stay exact.
      const { manifold, originalId } = buildCutter(M, overcutToBoard(box, board))
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
