// Router-mode arris picking (docs/chunk17-design.md §3.5, §19.2). A click on a board
// surface resolves to ONE of the 8 arrises — an `edge` (top/bottom/left/right, board-
// local per §3.4) × `face` (front = +thickness/+z, back = −thickness/−z). Pure over a
// board-local hit point + dims, so it is unit-testable without THREE.
import type { BoardDims } from '@tenon/core'

export type Edge = 'top' | 'bottom' | 'left' | 'right'
export type Face = 'front' | 'back'
export interface Arris {
  edge: Edge
  face: Face
}

// `local` is the raycast hit point expressed in the board's LOCAL frame (x = length,
// y = width, z = thickness), the frame the carve and edge_profiles live in. The face is
// the near thickness face (z sign); the edge is whichever of the four side edges the
// point sits closest to in plan (x/y), so a click near a corner picks the nearer side.
export function pickArris(local: [number, number, number], dims: BoardDims): Arris {
  const [x, y, z] = local
  const face: Face = z >= 0 ? 'front' : 'back'
  // Distance from the point to each side edge, in plan. Smallest wins.
  const dist: Record<Edge, number> = {
    top: dims.w / 2 - y, // +y edge
    bottom: y + dims.w / 2, // −y edge
    right: dims.l / 2 - x, // +x edge
    left: x + dims.l / 2, // −x edge
  }
  let edge: Edge = 'top'
  let best = Infinity
  for (const e of ['top', 'bottom', 'left', 'right'] as const) {
    if (dist[e] < best) {
      best = dist[e]
      edge = e
    }
  }
  return { edge, face }
}
