/// <reference lib="webworker" />
//
// Geometry evaluator worker (chunk 9, §13). Imports @tenon/core/eval — the ONLY
// place manifold-3d (WASM) is pulled on the client. Receives a Model, carves every
// board (base solid + edge grooves + joint cutters), and posts back typed-array
// meshes. The kernel inits once on the first message and is reused for every later eval.
import { createEvalCache, evaluate, getManifold } from '@tenon/core/eval'
import type { Model } from '@tenon/core'

type EvalRequest = { reqId: number; model: Model }

// Warm the WASM kernel as soon as the worker spawns so the first eval doesn't pay
// init latency (the designer kicks the worker on mount). Best-effort.
void getManifold()

// One per-board carve memo for this worker's lifetime (§8): a board whose dims +
// cutters are unchanged skips the Manifold carve and its prior mesh is reused. The
// cache holds canonical meshes, so we must NOT transfer (detach) their buffers — see
// the structured-clone note on postMessage below.
const cache = createEvalCache()

self.onmessage = async (e: MessageEvent<EvalRequest>) => {
  const { reqId, model } = e.data
  if (!model || typeof reqId !== 'number') return
  try {
    const { boards, warnings } = await evaluate(model, cache)
    // No transfer list: the memo keeps each board's canonical mesh in `cache`, so
    // transferring (detaching) a reused mesh's buffer would empty the cache. postMessage
    // structured-clones the typed arrays instead — cheap at board-scale mesh sizes, and
    // far cheaper than re-carving the unaffected boards the memo just skipped.
    self.postMessage({ reqId, ok: true, boards, warnings })
  } catch (err) {
    self.postMessage({ reqId, ok: false, error: String(err) })
  }
}
