// Lazy, memoized Manifold WASM init.
//
// This module PULLS manifold-3d (~540 KB WASM). It lives behind the
// `@tenon/core/eval` subpath and must NEVER be imported from the base
// `@tenon/core` entry — the server's op-validation and the jobs/photos PWA
// stay WASM-free (see docs/chunk9-design.md §"Why the subpath split").
//
// Used by the geometry web worker and the core eval tests only.
import Module from 'manifold-3d'
import type { ManifoldToplevel } from 'manifold-3d'

let toplevel: Promise<ManifoldToplevel> | undefined

/**
 * Resolve the Manifold WASM toplevel, initialising the kernel exactly once per
 * context (one worker / one test process). The returned promise is memoized so
 * concurrent callers share a single `Module()` + `setup()`.
 */
export function getManifold(): Promise<ManifoldToplevel> {
  toplevel ??= Module().then((mod) => {
    mod.setup()
    return mod
  })
  return toplevel
}
