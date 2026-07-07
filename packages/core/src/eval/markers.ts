// Render-only ghost markers (docs/chunk12-design.md §4): geometry that is DRAWN but never
// carved — drawbore pins now; the designed seam for §5.1 butt fastener ghosts later. The
// pin fills the hole it implies, so subtracting it would just churn the mesh; the viewport
// renders these as translucent cylinders instead.
//
// WASM-FREE BY CONSTRUCTION: pure pair-frame box math (pairSolids + the M&T layout), no
// Manifold — importable by the main-thread PWA bundle and, if ever needed, the server.
// Exported via the dedicated `@tenon/core/markers` subpath so neither the WASM-bearing
// `/eval` entry nor the base entry's server-bundle grep-invariant is touched.
import type { Model } from '../model.js'
import { checkJointPrecondition } from '../geometry/preconditions.js'
import { applyMat3 } from '../geometry/aabb.js'
import type { Vec3 } from '../geometry/aabb.js'
import { pairSolids } from './joints/util.js'
import { drawborePins } from './joints/mortiseTenon.js'

export interface JointMarker {
  jointId: string
  kind: 'drawbore_pin'
  center: Vec3 // world space
  axis: Vec3 // world-space unit direction of the cylinder's long axis
  dia: number
  len: number
}

export function jointMarkers(model: Model): JointMarker[] {
  const byId = new Map(model.boards.map((b) => [b.id, b]))
  const out: JointMarker[] = []
  for (const joint of model.joints) {
    if (joint.enabled === false || joint.type !== 'mortise_tenon' || joint.params.drawbore !== true) continue
    const boardA = byId.get(joint.a)
    const boardB = byId.get(joint.b)
    if (!boardA || !boardB) continue
    // Same gate as the carve: a moved/compound-angle pair gets lint, not markers.
    if (!checkJointPrecondition(joint.type, boardA, boardB, joint.params).ok) continue
    const pair = pairSolids(boardA, boardB)
    for (const pin of drawborePins(pair.a, pair.b, joint.params)) {
      // Pair frame (a's local frame) → world via a's transform.
      const rotated = applyMat3(pair.a.frame.rot, pin.center)
      const unit: Vec3 = [0, 0, 0]
      unit[pin.axis] = 1
      out.push({
        jointId: joint.id,
        kind: 'drawbore_pin',
        center: [
          rotated[0] + pair.a.frame.pos[0],
          rotated[1] + pair.a.frame.pos[1],
          rotated[2] + pair.a.frame.pos[2],
        ],
        axis: applyMat3(pair.a.frame.rot, unit),
        dia: pin.dia,
        len: pin.len,
      })
    }
  }
  return out
}
