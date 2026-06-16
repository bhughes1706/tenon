// Promise-wrapped RPC to the geometry worker (docs/chunk9-design.md §4 "Client").
//
// Spawns the worker lazily (the designer is code-split, so the worker + manifold-3d
// WASM only load when someone actually evaluates). Coalesces rapid op bursts: at most
// ONE eval is in flight and ONE queued — a newer request supersedes the queued one
// (resolved with null), and the latest always wins (§8). Rebuilds a THREE
// BufferGeometry from the transferred buffers on the main thread.
//
// This module pulls THREE; it is imported ONLY via dynamic import() from the store's
// evaluateGeometry action, so neither THREE nor the worker chunk land in the main
// (jobs/photos) bundle.
import * as THREE from 'three'
import type { Model, Warning } from '@tenon/core'
import type { EvalMesh } from '@tenon/core/eval'

export interface CarvedBoard {
  id: string
  geometry: THREE.BufferGeometry
  // Carried for chunk 11's face-pick → joint highlight. Stored, unused until then.
  provenance: Uint16Array
  features: EvalMesh['features']
}

export interface CarveResult {
  boards: CarvedBoard[]
  warnings: Warning[]
}

type WorkerMsg =
  | { reqId: number; ok: true; boards: { id: string; mesh: EvalMesh }[]; warnings: Warning[] }
  | { reqId: number; ok: false; error: string }

let worker: Worker | null = null
let seq = 0
let busyReqId: number | null = null
let queued: { model: Model; resolve: (r: CarveResult | null) => void } | null = null
const resolvers = new Map<number, (r: CarveResult | null) => void>()

function buildBoard({ id, mesh }: { id: string; mesh: EvalMesh }): CarvedBoard {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
  // Non-indexed triangle soup — no setIndex needed (mesh.ts de-indexes every triangle).
  // Carry per-triangle provenance + the feature table on userData so it survives into the
  // store's BufferGeometry map (which keeps only the geometry). Stored, unused until
  // chunk 11's face-pick → joint highlight (docs/chunk9-design.md §5).
  geometry.userData.provenance = mesh.provenance
  geometry.userData.features = mesh.features
  return { id, geometry, provenance: mesh.provenance, features: mesh.features }
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
    const msg = e.data
    const resolve = resolvers.get(msg.reqId)
    resolvers.delete(msg.reqId)
    if (msg.reqId === busyReqId) busyReqId = null
    if (resolve) {
      if (msg.ok) resolve({ boards: msg.boards.map(buildBoard), warnings: msg.warnings })
      else {
        console.error('[geometry] eval failed:', msg.error)
        resolve(null)
      }
    }
    flush()
  }
  worker.onerror = (e) => {
    console.error('[geometry] worker error:', e.message)
    for (const resolve of resolvers.values()) resolve(null)
    resolvers.clear()
    worker = null // allow ensureWorker() to spawn a fresh instance on the next carve
    busyReqId = null
    flush()
  }
  return worker
}

function flush(): void {
  if (busyReqId !== null || !queued) return
  const { model, resolve } = queued
  queued = null
  const reqId = ++seq
  busyReqId = reqId
  resolvers.set(reqId, resolve)
  ensureWorker().postMessage({ reqId, model })
}

// Evaluate a model's geometry. Resolves with the carved boards, or null if this
// request was superseded by a newer one (or the worker failed).
export function carve(model: Model): Promise<CarveResult | null> {
  return new Promise((resolve) => {
    if (queued) queued.resolve(null) // a newer request supersedes the not-yet-sent one
    queued = { model, resolve }
    flush()
  })
}
