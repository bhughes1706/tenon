// Analytic geometry layer — pure TS, NO Manifold/WASM, NO THREE. Exported from the
// base `@tenon/core` entry so the server (op-validation) and the jobs/photos PWA use
// it WASM-free. The Manifold carve pipeline lives behind `@tenon/core/eval` instead.
export * from './aabb.js'
export * from './collision.js'
export * from './preconditions.js'
