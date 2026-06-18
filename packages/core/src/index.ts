// Core package — shared types, op definitions, validators, geometry evaluator, joint library.
// No DOM APIs, no Node-only APIs. Runs identically in browser worker and in Node.
// Chunk 9 adds: geometry evaluator + Manifold worker plumbing

export const CORE_VERSION = '0.0.1'

export * from './ids.js'
export * from './common.js'
export * from './board.js'
export * from './joint.js'
export * from './model.js'
export * from './ops.js'
export * from './geometry/index.js'
export * from './hardware.js'
export * from './settings.js'
export * from './cutlist/index.js'
export * from './command.js'
export * from './validators.js'
