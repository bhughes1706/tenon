// Exploded-view offsets (chunk 9 bonus stage — joint visualization).
//
// A concealed joint (mortise & tenon, housing, blind tenon) can't be seen once the
// boards are assembled. An exploded view reveals it — but a closed frame can't be slid
// apart by real motion (you assemble it by mating sub-assemblies, not by sliding), so we
// do what CAD packages do: a DIAGRAMMATIC, centroid-radial separation. Every board drifts
// away from the assembly centre, so all gaps open at once regardless of connectivity
// (frames, carcasses, shared members).
//
// For v1's strictly-90° boards we AXIS-SNAP each board's outward direction to its dominant
// world axis, giving a clean orthographic "blow-apart". Magnitude scales with assembly
// size so the same slider feels right on a small frame or a big carcass.
//
// Pure (no THREE, no React): the Viewport adds the offset to each board's <group>
// position; geometry stays board-local and the model is untouched (this is display-only).
import type { Board } from '@tenon/core'
import { worldAABB } from '@tenon/core'

// Separation at factor=1, as a fraction of the assembly radius (half its AABB diagonal).
// Tunable — generous enough that even a sheared joint visibly clears its mate.
export const EXPLODE_GAIN = 0.8

const EPS = 1e-6

export type ExplodeOffsets = Map<string, [number, number, number]>

// Map of board id → world-space offset to add to its position. Empty when there's
// nothing to explode (factor 0, no model, or a single board).
//
// Takes just `{ boards }` rather than a full Model so the joint dialog's mini-preview
// can reuse this on an ad-hoc two-board pair without fabricating joints/groups/meta.
export function computeExplodeOffsets(model: { boards: Board[] } | null, factor: number): ExplodeOffsets {
  const out: ExplodeOffsets = new Map()
  if (!model || factor <= 0 || model.boards.length < 2) return out

  // Combined world AABB → centroid + radius (same basis the camera frames on).
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const b of model.boards) {
    const { min, max } = worldAABB(b)
    if (min[0] < minX) minX = min[0]
    if (min[1] < minY) minY = min[1]
    if (min[2] < minZ) minZ = min[2]
    if (max[0] > maxX) maxX = max[0]
    if (max[1] > maxY) maxY = max[1]
    if (max[2] > maxZ) maxZ = max[2]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2
  const radius = Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2, 6)
  const dist = factor * radius * EXPLODE_GAIN

  for (const b of model.boards) {
    // board.transform.pos is the board's world centre (geometry is origin-centred).
    const dx = b.transform.pos[0] - cx
    const dy = b.transform.pos[1] - cy
    const dz = b.transform.pos[2] - cz
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz)
    // Dominant axis, sign preserved. A board sitting on the centroid (all ≈0) stays put.
    let ox = 0, oy = 0, oz = 0
    if (ax >= ay && ax >= az && ax > EPS) ox = Math.sign(dx) * dist
    else if (ay >= az && ay > EPS) oy = Math.sign(dy) * dist
    else if (az > EPS) oz = Math.sign(dz) * dist
    out.set(b.id, [ox, oy, oz])
  }
  return out
}
