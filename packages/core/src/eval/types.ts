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

// JointFn output: cutters for each participant + any joinery warnings.
export interface CutterSet {
  a: CutterBox[] // subtracted from board a (a's local frame)
  b: CutterBox[] // subtracted from board b (b's local frame)
  warnings: Warning[]
}

// Pure geometric description of a board for JointFns — no Manifold (the cutter math
// is analytic box geometry). `obb` is angle-readiness insurance (§Angle readiness).
export interface BoardSolid {
  board: Board
  aabb: AABB
  obb: OBB
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
