// Chunk 9 spike — the kernel-gating probe (docs/chunk9-design.md §11 step 1, §9 gotchas #1/#2).
//
// One job: prove the Manifold WASM kernel loads and carves a box, producing a
// stable, watertight result — in BOTH the vitest (node) runner and the Vite ES
// web worker. Shared by both so the two environments exercise identical code.
//
// This is throwaway scaffolding: once the real `solids.ts` / `evaluate.ts`
// pipeline lands (§11 step 3) this file should be deleted.
import { getManifold } from './manifold.js'

export interface CarveProbeResult {
  /** Volume of the carved solid, in³. Exact analytic expectation: 6. */
  volume: number
  /** Vertex count of the carved mesh — drift canary for a manifold-3d bump. */
  numVert: number
  /** Axis-aligned bounding box of the carved solid: [min, max]. */
  bbox: { min: [number, number, number]; max: [number, number, number] }
  /** Manifold validity — must be 'NoError' (§6.1 manifold-validity invariant). */
  status: string
  /** Triangle count of the extracted indexed mesh. */
  triCount: number
}

/**
 * Carve a 1×1 through-pocket out of a 2×2×2 cube — a minimal stand-in for a
 * through mortise. Deterministic: removes a 1×1×2 prism, leaving volume 6.
 */
export async function carveBoxProbe(): Promise<CarveProbeResult> {
  const { Manifold } = await getManifold()

  // base 2×2×2 cube centered at origin → volume 8
  const base = Manifold.cube([2, 2, 2], true)
  // 1×1 bar centered, longer than the base in Z so it cuts clean through → removes 1×1×2 = 2
  const cutter = Manifold.cube([1, 1, 3], true)
  const carved = base.subtract(cutter)

  const box = carved.boundingBox()
  const mesh = carved.getMesh()

  const result: CarveProbeResult = {
    volume: carved.volume(),
    numVert: carved.numVert(),
    bbox: { min: box.min, max: box.max },
    status: carved.status(),
    triCount: mesh.triVerts.length / 3,
  }

  // Manifold objects are WASM-backed; free them explicitly to avoid heap churn.
  base.delete()
  cutter.delete()
  carved.delete()

  return result
}
