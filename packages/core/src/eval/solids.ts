// Board base solids + cutter prisms for the Manifold carve (docs/chunk9-design.md §2b).
// PULLS no WASM by itself — it takes the Manifold static (the `Manifold` class from a
// resolved getManifold()) as a param, so the box math stays unit-testable and the WASM
// boundary stays in evaluate.ts.
//
// Everything is built in the board's LOCAL frame (box centred at origin, dims along
// x=l, y=w, z=t). The viewport keeps board.transform on the R3F <group>, so the carve
// never touches world space — the chunk 7/8 gizmo/snapping path is untouched (§5, gotcha #5).
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Board } from '../board.js'
import type { CutterBox } from './types.js'

type ManifoldStatic = ManifoldToplevel['Manifold']

// Overcut applied to a cutter's OPEN faces so a coplanar cut doesn't leave a
// zero-thickness skin or a non-manifold sliver (gotcha #4). Never applied to a
// stopped end — a stopped groove must keep its wall.
export const OVERCUT = 0.01

// Centred base box for a board, in its LOCAL frame.
export function baseSolid(M: ManifoldStatic, board: Board): Manifold {
  return M.cube([board.dims.l, board.dims.w, board.dims.t], true)
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
// joint cutters — a groove is a board feature, not a joint partner (gotcha #7).
//
// Convention (no §3.4 edge text was loaded; documented here + in AGENT_HANDOFF gotcha):
//   • top/bottom  = the ±y(width) long edges; groove runs along x(length), `depth` cuts
//                   inward along y.
//   • left/right  = the ±x(length) end edges; groove runs along y(width), `depth` cuts
//                   inward along x (right = +x end, left = -x end).
//   • `width` is the z(thickness) extent of the slot; `offset` shifts it along z.
// The mouth (the open edge face) and the run ends are overcut unless a `stop_*` pins them.
export function edgeGrooveCutters(board: Board): CutterBox[] {
  const hx = board.dims.l / 2
  const hy = board.dims.w / 2
  const out: CutterBox[] = []
  for (const g of board.edge_grooves) {
    const z0 = g.offset - g.width / 2
    const z1 = g.offset + g.width / 2
    if (g.edge === 'top' || g.edge === 'bottom') {
      // runs along x; stops (if any) pull the run ends in, else overcut them
      const xLo = g.stopped && g.stop_near != null ? -hx + g.stop_near : -hx - OVERCUT
      const xHi = g.stopped && g.stop_far != null ? hx - g.stop_far : hx + OVERCUT
      const yLo = g.edge === 'top' ? hy - g.depth : -hy - OVERCUT
      const yHi = g.edge === 'top' ? hy + OVERCUT : -hy + g.depth
      out.push({ min: [xLo, yLo, z0], max: [xHi, yHi, z1], feature: 'groove' })
    } else {
      // left/right: runs along y; depth cuts inward along x
      const yLo = g.stopped && g.stop_near != null ? -hy + g.stop_near : -hy - OVERCUT
      const yHi = g.stopped && g.stop_far != null ? hy - g.stop_far : hy + OVERCUT
      const xLo = g.edge === 'right' ? hx - g.depth : -hx - OVERCUT
      const xHi = g.edge === 'right' ? hx + OVERCUT : -hx + g.depth
      out.push({ min: [xLo, yLo, z0], max: [xHi, yHi, z1], feature: 'groove' })
    }
  }
  return out
}
