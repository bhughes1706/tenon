// Board base solids + cutter prisms for the Manifold carve (docs/chunk9-design.md §2b).
// PULLS no WASM by itself — it takes the Manifold static (the `Manifold` class from a
// resolved getManifold()) as a param, so the box math stays unit-testable and the WASM
// boundary stays in evaluate.ts.
//
// Everything is built in the board's LOCAL frame (box centred at origin, dims along
// x=l, y=w, z=t). The viewport keeps board.transform on the R3F <group>, so the carve
// never touches world space — the chunk 7/8 gizmo/snapping path is untouched (§5, gotcha #5).
//
// CUTTER OVERCUT (gotcha #4) is applied centrally by overcutToBoard(), not by the
// JointFns: a cutter face that is flush with (or past) a board face is pushed out by
// OVERCUT so the boolean breaks through cleanly instead of leaving a zero-thickness
// skin; an interior face (a pocket wall) is left exact. JointFns therefore emit the TRUE
// cut geometry and never reason about overcut — which also keeps removed volumes exact
// (an overcut that landed inside the board would silently remove extra material).
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Board } from '../board.js'
import type { Vec3 } from '../geometry/aabb.js'
import type { CutterBox } from './types.js'

type ManifoldStatic = ManifoldToplevel['Manifold']

// Distance a cutter's OPEN (flush-or-beyond) faces are pushed past the board face.
export const OVERCUT = 0.01

// A cutter bound within this of a board face counts as flush (float-noise tolerant).
const FLUSH_EPS = 1e-6

// Centred base box for a board, in its LOCAL frame.
export function baseSolid(M: ManifoldStatic, board: Board): Manifold {
  return M.cube([board.dims.l, board.dims.w, board.dims.t], true)
}

// Push any cutter face flush with (or outside) a board face out by OVERCUT so the cut
// breaks through cleanly; leave interior faces exact. The cutter is already in the
// board's LOCAL frame, so the board faces are ±(l,w,t)/2.
export function overcutToBoard(box: CutterBox, board: Board): CutterBox {
  const h: Vec3 = [board.dims.l / 2, board.dims.w / 2, board.dims.t / 2]
  const min: Vec3 = [...box.min]
  const max: Vec3 = [...box.max]
  for (let i = 0; i < 3; i++) {
    if (min[i] <= -h[i] + FLUSH_EPS) min[i] = -h[i] - OVERCUT
    if (max[i] >= h[i] - FLUSH_EPS) max[i] = h[i] + OVERCUT
  }
  return { ...box, min, max }
}

// Turn a local-frame axis-aligned cutter box into a Manifold prism, returning the
// prism plus the Manifold originalID of the source cube so the carve can map output
// triangles back to this cutter's CutFeature (provenance, §2e). The source cube is
// freed here — the translated product keeps the integer originalID after the source
// is deleted (verified against manifold-3d 3.5.1).
export function buildCutter(M: ManifoldStatic, box: CutterBox): { manifold: Manifold; originalId: number } {
  const dx = box.max[0] - box.min[0]
  const dy = box.max[1] - box.min[1]
  const dz = box.max[2] - box.min[2]
  const cx = (box.min[0] + box.max[0]) / 2
  const cy = (box.min[1] + box.max[1]) / 2
  const cz = (box.min[2] + box.max[2]) / 2
  const cube = M.cube([dx, dy, dz], true)
  const originalId = cube.originalID()
  const manifold = cube.translate(cx, cy, cz)
  cube.delete()
  return { manifold, originalId }
}

// Board edge grooves → local-frame cutter boxes (§3.4). Carved in baseSolid BEFORE any
// joint cutters — a groove is a board feature, not a joint partner (gotcha #7). Boxes
// are EXACT; overcutToBoard opens the mouth + run-ends (gotcha #4) at carve time.
//
// Convention (no §3.4 edge text was loaded; documented here + in AGENT_HANDOFF gotcha):
//   • top/bottom  = the ±y(width) long edges; groove runs along x(length), `depth` cuts
//                   inward along y.
//   • left/right  = the ±x(length) end edges; groove runs along y(width), `depth` cuts
//                   inward along x (right = +x end, left = -x end).
//   • `width` is the z(thickness) extent of the slot; `offset` shifts it along z.
// A `stop_*` pulls a run end inward (interior → kept exact → a real stopped wall).
export function edgeGrooveCutters(board: Board): CutterBox[] {
  const hx = board.dims.l / 2
  const hy = board.dims.w / 2
  const out: CutterBox[] = []
  for (const g of board.edge_grooves) {
    const z0 = g.offset - g.width / 2
    const z1 = g.offset + g.width / 2
    if (g.edge === 'top' || g.edge === 'bottom') {
      const xLo = g.stopped && g.stop_near != null ? -hx + g.stop_near : -hx
      const xHi = g.stopped && g.stop_far != null ? hx - g.stop_far : hx
      const yLo = g.edge === 'top' ? hy - g.depth : -hy
      const yHi = g.edge === 'top' ? hy : -hy + g.depth
      out.push({ min: [xLo, yLo, z0], max: [xHi, yHi, z1], feature: 'groove' })
    } else {
      const yLo = g.stopped && g.stop_near != null ? -hy + g.stop_near : -hy
      const yHi = g.stopped && g.stop_far != null ? hy - g.stop_far : hy
      const xLo = g.edge === 'right' ? hx - g.depth : -hx
      const xHi = g.edge === 'right' ? hx : -hx + g.depth
      out.push({ min: [xLo, yLo, z0], max: [xHi, yHi, z1], feature: 'groove' })
    }
  }
  return out
}
