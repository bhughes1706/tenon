// Chunk 9 spike gate — gotcha #2 (docs/chunk9-design.md §9): confirm manifold-3d
// loads and carves under vitest's node runner, in-process, BEFORE the golden
// suite (§6.1) is written. If `await Module()` can't resolve the .wasm here, the
// property tests block the chunk — so this runs first and stands alone.
import { describe, it, expect } from 'vitest'
import { getManifold } from '../manifold.js'
import { carveBoxProbe } from '../spike.js'

describe('manifold-3d spike (node/vitest WASM gate)', () => {
  it('initialises the WASM kernel via Module() + setup()', async () => {
    const mod = await getManifold()
    expect(typeof mod.Manifold).toBe('function')
    expect(typeof mod.Manifold.cube).toBe('function')
  })

  it('memoizes the toplevel (one init per process)', async () => {
    const a = await getManifold()
    const b = await getManifold()
    expect(a).toBe(b)
  })

  it('carves a through-pocket and reports the exact analytic volume', async () => {
    const r = await carveBoxProbe()
    // 2×2×2 cube (vol 8) minus a 1×1 through-bar (removes 1×1×2 = 2) → 6
    expect(r.volume).toBeCloseTo(6, 6)
    expect(r.status).toBe('NoError')
  })

  it('produces a stable mesh (kernel-drift canary — regen deliberately on a manifold-3d bump, §16.5)', async () => {
    const r = await carveBoxProbe()
    expect({
      numVert: r.numVert,
      triCount: r.triCount,
      bbox: r.bbox,
    }).toMatchInlineSnapshot(`
      {
        "bbox": {
          "max": [
            1,
            1,
            1,
          ],
          "min": [
            -1,
            -1,
            -1,
          ],
        },
        "numVert": 16,
        "triCount": 32,
      }
    `)
  })
})
