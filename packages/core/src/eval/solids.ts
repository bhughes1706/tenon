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
import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d'
import type { Board } from '../board.js'
import type { Vec3 } from '../geometry/aabb.js'
import type { CutterBox, CutterFrustum, CutterProfile } from './types.js'
import { frustumCorners, frustumRectAxes } from './types.js'
import { profileCurve } from './profiles.js'

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

// Overcut (gotcha #4) for a frustum, mirroring overcutToBoard. Two rules cover every
// frustum this codebase emits (docs/chunk12-design.md §1): a STATION plane flush with a
// board face is pushed out as a straight extrusion of the true end cross-section, and a
// rect bound flush at BOTH stations is pushed out on both. A rect bound flush at only one
// station (a sloped face grazing the surface) does not occur and would stay exact.
//
// A pushed-out station must NOT keep interpolating the taper: `buildFrustumCutter` builds
// a single hull between the two (possibly moved) stations, so if the far station just kept
// its true rect value while the span grew, the hull would re-spread that same taper over
// the now-longer span — shifting the cross-section AT THE TRUE FACE away from the exact
// rect the analytic volume assumes (this silently over/under-removed material on every
// dovetail pin/tail — the bug the §6.1 complement test caught). The fix: extrapolate each
// moved station's rect along the ORIGINAL (true station) taper line, so the interpolated
// cross-section at the true station is reproduced exactly and the extension beyond it is a
// straight cap.
export function overcutFrustumToBoard(f: CutterFrustum, board: Board): CutterFrustum {
  const h: Vec3 = [board.dims.l / 2, board.dims.w / 2, board.dims.t / 2]
  const [u, v] = frustumRectAxes(f.axis)
  const [a, b] = f.span
  let aNew = a
  let bNew = b
  if (a <= -h[f.axis] + FLUSH_EPS) aNew = -h[f.axis] - OVERCUT
  if (b >= h[f.axis] - FLUSH_EPS) bNew = h[f.axis] + OVERCUT

  const span0 = b - a
  const rectAt = (t: number): { min: [number, number]; max: [number, number] } => ({
    min: [0, 1].map((i) => f.rectLo.min[i] + (f.rectHi.min[i] - f.rectLo.min[i]) * t) as [number, number],
    max: [0, 1].map((i) => f.rectLo.max[i] + (f.rectHi.max[i] - f.rectLo.max[i]) * t) as [number, number],
  })
  const lo = span0 > 1e-12 ? rectAt((aNew - a) / span0) : { min: [...f.rectLo.min] as [number, number], max: [...f.rectLo.max] as [number, number] }
  const hi = span0 > 1e-12 ? rectAt((bNew - a) / span0) : { min: [...f.rectHi.min] as [number, number], max: [...f.rectHi.max] as [number, number] }

  for (const [i, axis] of [[0, u], [1, v]] as const) {
    if (f.rectLo.min[i] <= -h[axis] + FLUSH_EPS && f.rectHi.min[i] <= -h[axis] + FLUSH_EPS) {
      lo.min[i] = -h[axis] - OVERCUT
      hi.min[i] = -h[axis] - OVERCUT
    }
    if (f.rectLo.max[i] >= h[axis] - FLUSH_EPS && f.rectHi.max[i] >= h[axis] - FLUSH_EPS) {
      lo.max[i] = h[axis] + OVERCUT
      hi.max[i] = h[axis] + OVERCUT
    }
  }
  return { ...f, span: [aNew, bNew], rectLo: lo, rectHi: hi }
}

// Frustum → Manifold via the convex hull of its 8 corners; asOriginal() mints the
// originalID face provenance needs (hulled solids are not "original" by construction).
export function buildFrustumCutter(
  M: ManifoldStatic,
  f: CutterFrustum,
): { manifold: Manifold; originalId: number } {
  const hulled = M.hull(frustumCorners(f))
  const manifold = hulled.asOriginal()
  hulled.delete()
  return { manifold, originalId: manifold.originalID() }
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

// §1 arris → board-local axes (docs/chunk17-design.md), mirroring edgeGrooveCutters'
// edge convention extended with the face axis. `axis` is the sweep axis; `uSign` is the
// board-local sign of the edge's cross-grain normal (the u direction); the first cross
// axis frustumRectAxes(axis)[0] is that u axis, and its half-extent is the board dim
// perpendicular to the sweep.
const EDGE_AXIS: Record<'top' | 'bottom' | 'left' | 'right', 0 | 1> = { top: 0, bottom: 0, left: 1, right: 1 }
const EDGE_USIGN: Record<'top' | 'bottom' | 'left' | 'right', 1 | -1> = { top: 1, bottom: -1, left: -1, right: 1 }

// Board edge profiles → arris-frame swept-profile cutters (§3). Carved before joint
// cutters (a board feature, like edge grooves). Curve stays in arris-frame; `axis` +
// `corner` + `half` carry all placement, resolved by buildProfileCutter.
export function edgeProfileCutters(board: Board): CutterProfile[] {
  const out: CutterProfile[] = []
  for (const p of board.edge_profiles ?? []) {
    const axis = EDGE_AXIS[p.edge]
    const span: [number, number] = axis === 0 ? [-board.dims.l / 2, board.dims.l / 2] : [-board.dims.w / 2, board.dims.w / 2]
    // uAxis = frustumRectAxes(axis)[0]: y (halfU = w/2) for top/bottom, x (halfU = l/2) for left/right.
    const halfU = axis === 0 ? board.dims.w / 2 : board.dims.l / 2
    out.push({
      profileCut: true,
      axis,
      span,
      corner: [EDGE_USIGN[p.edge], p.face === 'front' ? 1 : -1],
      curve: profileCurve(p),
      half: [halfU, board.dims.t / 2],
      feature: 'edge_profile',
      edgeProfileId: p.id,
    })
  }
  return out
}

// Signed area of a 2D polygon (shoelace). Positive = CCW.
function signedArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

// Swept-profile cutter → Manifold (docs/chunk17-design.md §3). Maps the arris-frame
// curve into the board-local cross-section plane, closes it with a 3-point overcut cap
// that clears BOTH flush faces (a 2-point cap would leave a zero-thickness skin along
// one face — the failure OVERCUT exists to prevent), extrudes along the polygon's local
// z, then places that z onto the board's sweep `axis` with a single 90°-multiple
// rotation via an explicit affine matrix. asOriginal() mints the face-provenance id.
//
// `half` + `corner` are self-contained here (no Board needed) — same as buildFrustumCutter.
export function buildProfileCutter(M: ManifoldStatic, c: CutterProfile): { manifold: Manifold; originalId: number } {
  const [uAxis, vAxis] = frustumRectAxes(c.axis)
  const [halfU, halfV] = c.half
  // The overcut cap must enclose the WHOLE curve, so use its max extents — not just the
  // endpoints. For the analytic primitives the endpoints are the max, but a compound
  // molding can bulge deeper mid-path (a bead), and a cap sized to the endpoint would let
  // that bulge poke outside the closing edge and self-intersect the polygon.
  const reach = Math.max(...c.curve.map((p) => p[0]))
  const depth = Math.max(...c.curve.map((p) => p[1]))

  // Arris-frame boundary: the profile curve, then the overcut cap around the OUTSIDE of
  // the corner. Append cap vertices — never move the curve's flush-face endpoints, or the
  // arc's tangent points no longer land on the true faces (same gotcha as overcutToBoard).
  const arris: [number, number][] = [
    ...c.curve,
    [-OVERCUT, depth],
    [-OVERCUT, -OVERCUT],
    [reach, -OVERCUT],
  ]
  // Map each arris-frame (u, v) → board-local coords along (uAxis, vAxis). The corner
  // sign resolves here: +1 → arris at +half, cut reaches back toward the origin.
  const poly: [number, number][] = arris.map(([u, v]) => [
    c.corner[0] > 0 ? halfU - u : -halfU + u,
    c.corner[1] > 0 ? halfV - v : -halfV + v,
  ])
  // The corner-sign mapping reverses winding exactly when corner[0]·corner[1] = −1 (a
  // one-axis reflection). CrossSection's Positive fill rule needs CCW, so normalize by
  // signed area — an inverted/degenerate cutter would otherwise carve nothing or invert.
  if (signedArea(poly) < 0) poly.reverse()

  // Extrude along local z, centred, so the run is symmetric about the origin; the cap
  // already added OVERCUT to both ends, so extrude the full span + 2·OVERCUT.
  const spanLen = c.span[1] - c.span[0]
  const extruded = M.extrude(poly, spanLen + 2 * OVERCUT, 0, 0, [1, 1], true)

  // Place the extrusion: poly-x → board uAxis (+), poly-y → board vAxis (+), extrusion
  // z → board sweep axis. zSign is chosen per axis so the linear map has det +1 (a proper
  // rotation, not a reflection): axis 0 → +1, axis 1 → −1. Mat4 is column-major; columns
  // 0..2 are the images of x/y/z, column 3 is the translation.
  const zSign = c.axis === 0 ? 1 : -1
  const mid = (c.span[0] + c.span[1]) / 2
  const col = (axis: number, s: number): [number, number, number] => {
    const out: [number, number, number] = [0, 0, 0]
    out[axis] = s
    return out
  }
  const [cx, cy, cz] = [col(uAxis, 1), col(vAxis, 1), col(c.axis, zSign)]
  const t = col(c.axis, mid)
  const mat: Mat4 = [cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, cz[0], cz[1], cz[2], 0, t[0], t[1], t[2], 1]
  const placed = extruded.transform(mat)
  extruded.delete()

  const manifold = placed.asOriginal()
  placed.delete()
  return { manifold, originalId: manifold.originalID() }
}
