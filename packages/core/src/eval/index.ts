// @tenon/core/eval — the WASM-bearing geometry layer (worker + tests only).
//
// Importing this entry pulls manifold-3d. The base `@tenon/core` entry
// (src/index.ts) must never re-export from here, so the server bundle and the
// jobs/photos PWA stay WASM-free.
export { getManifold } from './manifold.js'
export { evaluate, createEvalCache } from './evaluate.js'
export { baseSolid, buildCutter, buildFrustumCutter, buildProfileCutter, edgeGrooveCutters, edgeProfileCutters, OVERCUT } from './solids.js'
export { isFrustum, isProfile, cutterBounds, frustumCorners, frustumRectAxes } from './types.js'
export { profileCurve, PROFILE_FACETS, COMPOUND_ARC_FACETS } from './profiles.js'
export { toEvalMesh } from './mesh.js'
export { jointFaceMesh } from './jointFaces.js'
export { JOINT_FNS } from './joints/index.js'
export type {
  EvalMesh,
  EvalResult,
  EvalCache,
  CutFeature,
  CutFeatureKind,
  Cutter,
  CutterBox,
  CutterFrustum,
  CutterProfile,
  CutterSet,
  BoardSolid,
  EvalCtx,
  JointFn,
} from './types.js'
