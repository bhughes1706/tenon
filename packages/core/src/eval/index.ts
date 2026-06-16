// @tenon/core/eval — the WASM-bearing geometry layer (worker + tests only).
//
// Importing this entry pulls manifold-3d. The base `@tenon/core` entry
// (src/index.ts) must never re-export from here, so the server bundle and the
// jobs/photos PWA stay WASM-free.
export { getManifold } from './manifold.js'
export { evaluate } from './evaluate.js'
export { baseSolid, buildCutter, edgeGrooveCutters, OVERCUT } from './solids.js'
export { toEvalMesh } from './mesh.js'
export { JOINT_FNS } from './joints/index.js'
export type {
  EvalMesh,
  EvalResult,
  CutFeature,
  CutFeatureKind,
  CutterBox,
  CutterSet,
  BoardSolid,
  EvalCtx,
  JointFn,
} from './types.js'
