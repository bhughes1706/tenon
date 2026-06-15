/// <reference lib="webworker" />
//
// Geometry evaluator worker (chunk 9, §13). Imports @tenon/core/eval — the ONLY
// place manifold-3d (WASM) is pulled on the client. Receives a Model, carves every
// board (base solid + edge grooves; joint cutters land in stage 4), and posts back
// transferable typed-array meshes. The kernel inits once on the first message and is
// reused for every later eval.
import { evaluate, getManifold } from '@tenon/core/eval'
import type { Model } from '@tenon/core'

type EvalRequest = { reqId: number; model: Model }

// Warm the WASM kernel as soon as the worker spawns so the first eval doesn't pay
// init latency (the designer kicks the worker on mount). Best-effort.
void getManifold()

self.onmessage = async (e: MessageEvent<EvalRequest>) => {
  const { reqId, model } = e.data
  if (!model || typeof reqId !== 'number') return
  try {
    const { boards, warnings } = await evaluate(model)
    // Collect every typed array's buffer so they move (not copy) to the main thread.
    const transfer: ArrayBuffer[] = []
    for (const b of boards) {
      transfer.push(
        b.mesh.positions.buffer,
        b.mesh.normals.buffer,
        b.mesh.provenance.buffer,
      )
    }
    self.postMessage({ reqId, ok: true, boards, warnings }, transfer)
  } catch (err) {
    self.postMessage({ reqId, ok: false, error: String(err) })
  }
}
