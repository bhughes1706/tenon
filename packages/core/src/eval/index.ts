// @tenon/core/eval — the WASM-bearing geometry layer (worker + tests only).
//
// Importing this entry pulls manifold-3d. The base `@tenon/core` entry
// (src/index.ts) must never re-export from here, so the server bundle and the
// jobs/photos PWA stay WASM-free.
export { getManifold } from './manifold.js'
export { carveBoxProbe, type CarveProbeResult } from './spike.js'
