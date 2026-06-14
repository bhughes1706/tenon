/// <reference lib="webworker" />
//
// Geometry evaluator worker (chunk 9). Imports @tenon/core/eval — the ONLY
// place manifold-3d (WASM) is pulled on the client. The full evaluate(model)
// RPC + latest-wins coalescing land with §11 step 3; for now this carries just
// the spike probe that proves the kernel boots and carves inside a Vite ES
// worker (docs/chunk9-design.md §9 gotcha #1).
import { carveBoxProbe } from '@tenon/core/eval'

type SpikeRequest = { reqId: number; type: 'spike' }

self.onmessage = async (e: MessageEvent<SpikeRequest>) => {
  const { reqId, type } = e.data
  if (type !== 'spike') return
  try {
    const result = await carveBoxProbe()
    self.postMessage({ reqId, ok: true, result })
  } catch (err) {
    self.postMessage({ reqId, ok: false, error: String(err) })
  }
}
