// Shared types for the geometry evaluator (@tenon/core/eval). WASM-free — these are
// plain data, so they can be imported by JointFns, the worker, and the store.
//
// Design note vs. docs/chunk9-design.md §2c: the doc sketches `JointFn` returning
// `Manifold[]`. We instead return frame-tagged box SPECS (CutterBox). For v1 every
// cut is an axis-aligned prism (§6 step 3), so JointFns are pure box math — no WASM,
// unit-testable without booting Manifold — and the Manifold carve stays confined to
// evaluate.ts. The carve still happens; only the JointFn boundary moved.

import type { Board } from '../board.js'
import type { Model } from '../model.js'
import type { Warning } from '../common.js'
import type { Vec3, AABB, OBB } from '../geometry/aabb.js'

// Where a carved triangle came from — stored for chunk 11's face-pick → joint
// highlight. Produced now, consumed later (the contract, not the UI).
export type CutFeatureKind =
  | 'base'
  | 'mortise'
  | 'tenon_cheek'
  | 'shoulder'
  | 'rabbet'
  | 'dado'
  | 'groove'
  | 'lap'
  | 'slot'
  | 'cheek'
  | 'haunch'
  | 'kerf'
  // chunk 16 — box joint + dovetail (docs/chunk16-design.md)
  | 'finger' // box-joint finger/socket band (both boards)
  | 'tail_socket' // dovetail: tail-shaped void removed from a (pin board)
  | 'pin_socket' // dovetail: pin-shaped void + edge notches removed from b (tail board)

export interface CutFeature {
  id: number // matches the per-triangle provenance index
  kind: CutFeatureKind
  jointId?: string // undefined for board-level features (base, edge groove)
}

// A cutter prism expressed in the TARGET board's LOCAL frame (box centred at the
// board origin). The carve subtracts it from the board's base solid.
export interface CutterBox {
  min: Vec3
  max: Vec3
  feature: CutFeatureKind
  jointId?: string
}

// A tapered cutter (docs/chunk12-design.md §1): a linear sweep along `axis` between two
// axis-aligned rectangles — the wedged mortise's exit flare and the sloped haunch, the two
// §5.6 cuts that are not boxes. Convex, 8 vertices, exact. Rect coords are the OTHER two
// axes in ascending axis order (axis 1 → rect axes [0, 2]). Expressed, like CutterBox, in
// the target board's LOCAL frame.
export interface CutterFrustum {
  frustum: true // discriminant: `'frustum' in cutter`
  axis: 0 | 1 | 2
  span: [number, number] // stations along `axis` (lo ≤ hi)
  rectLo: { min: [number, number]; max: [number, number] } // cross-section at span[0]
  rectHi: { min: [number, number]; max: [number, number] } // cross-section at span[1]
  feature: CutFeatureKind
  jointId?: string
}

export type Cutter = CutterBox | CutterFrustum

export const isFrustum = (c: Cutter): c is CutterFrustum => 'frustum' in c

// Rect axes for a frustum's sweep axis: the other two axes in ascending order.
export const frustumRectAxes = (axis: 0 | 1 | 2): [number, number] =>
  axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]

// The 8 corners of a frustum cutter (4 per station, lo-station group first).
export function frustumCorners(f: CutterFrustum): Vec3[] {
  const [u, v] = frustumRectAxes(f.axis)
  const out: Vec3[] = []
  for (const [s, r] of [[f.span[0], f.rectLo], [f.span[1], f.rectHi]] as const) {
    for (const cu of [r.min[0], r.max[0]]) {
      for (const cv of [r.min[1], r.max[1]]) {
        const p: Vec3 = [0, 0, 0]
        p[f.axis] = s
        p[u] = cu
        p[v] = cv
        out.push(p)
      }
    }
  }
  return out
}

// Conservative local-frame bounds of any cutter (frustum bounds = station span × the
// union of its two rects) — containment tests and broad checks.
export function cutterBounds(c: Cutter): AABB {
  if (!isFrustum(c)) return { min: c.min, max: c.max }
  const [u, v] = frustumRectAxes(c.axis)
  const min: Vec3 = [0, 0, 0]
  const max: Vec3 = [0, 0, 0]
  min[c.axis] = c.span[0]
  max[c.axis] = c.span[1]
  min[u] = Math.min(c.rectLo.min[0], c.rectHi.min[0])
  max[u] = Math.max(c.rectLo.max[0], c.rectHi.max[0])
  min[v] = Math.min(c.rectLo.min[1], c.rectHi.min[1])
  max[v] = Math.max(c.rectLo.max[1], c.rectHi.max[1])
  return { min, max }
}

// JointFn output: cutters for each participant + any joinery warnings.
export interface CutterSet {
  a: Cutter[] // subtracted from board a (a's local frame)
  b: Cutter[] // subtracted from board b (b's local frame)
  warnings: Warning[]
}

// The reference frame a BoardSolid's boxes are expressed in: an origin + a rotation
// matrix (rows/cols per geometry/aabb.ts conventions). Joint carving uses the PAIR
// frame — board a's own local frame — so recipes are exact whenever the two boards
// are square to each other, at ANY world orientation (§Angle readiness).
export interface SolidFrame {
  pos: Vec3
  rot: number[][] // 3×3 rotation, frame-local → world
}

// Pure geometric description of a board for JointFns — no Manifold (the cutter math
// is analytic box geometry). `aabb`/`obb` are expressed in `frame`, NOT in world:
// evaluate.ts builds these per joint via pairSolids(), so for board a the aabb is its
// own exact local box and for board b it is b's box as seen from a's frame (exact for
// mutually-square pairs). toLocal() uses `frame` to convert cutter boxes into each
// target board's local frame.
export interface BoardSolid {
  board: Board
  aabb: AABB
  obb: OBB
  frame: SolidFrame
}

export interface EvalCtx {
  model: Model
  tol: number // 1/64
}

// ctx is a reserved seam: no first-wave JointFn uses it yet, but it will be needed for
// features that require model-level state (e.g. haunch derives from model edge_grooves)
// or the tolerance constant. Pass it through; don't remove it.
export type JointFn = (a: BoardSolid, b: BoardSolid, params: Record<string, unknown>, ctx: EvalCtx) => CutterSet

// Transferable carved mesh for one board. All typed arrays' .buffers go in the
// worker transfer list. positions/normals/index are GL-ready; provenance maps each
// triangle → an index into `features` (chunk 11).
export interface EvalMesh {
  positions: Float32Array
  normals: Float32Array
  // Non-indexed triangle soup: positions/normals are de-indexed (3 verts × triCount),
  // so THREE.js BufferGeometry needs no setIndex call and WebGL draws directly.
  provenance: Uint16Array // length = triangle count
  features: CutFeature[]
}

export interface EvalResult {
  boards: { id: string; mesh: EvalMesh }[]
  warnings: Warning[]
}

// Per-board carve memo (docs/chunk9-design.md §8). Maps board id → the carve key (a
// stable hash of everything the LOCAL carve depends on: the board dims + its cutter
// boxes) and the EvalMesh that key produced. evaluate() reuses the cached mesh when the
// key is unchanged, skipping the Manifold carve. The worker holds one cache for its
// lifetime; it structured-clones meshes to the main thread, so a reused (cached) mesh
// is never detached/mutated. Boards no longer in the model are pruned each eval.
export interface EvalCache {
  boards: Map<string, { key: string; mesh: EvalMesh }>
}
