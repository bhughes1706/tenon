// Chunk 9 spike harness (throwaway — delete with spike.html once §11 step 3 lands).
// Boots the geometry worker, requests one carve, and writes the result into the
// DOM + console so a headless browser can read it back. Proves gotcha #1:
// manifold-3d's WASM resolves relative to the worker URL under Vite and carves
// at runtime.
const out = document.getElementById('out')!

const worker = new Worker(new URL('./workers/geometry.worker.ts', import.meta.url), {
  type: 'module',
})

const t0 = performance.now()

worker.onmessage = (e: MessageEvent) => {
  const ms = Math.round(performance.now() - t0)
  const payload = { bootMs: ms, ...e.data }
  out.dataset.status = 'done'
  out.textContent = JSON.stringify(payload, null, 2)
  console.log('SPIKE_RESULT ' + JSON.stringify(payload))
}

worker.onerror = (e) => {
  out.dataset.status = 'error'
  out.textContent = `worker error: ${e.message}`
  console.log('SPIKE_ERROR worker.onerror: ' + (e.message || '(no message)'))
}

window.addEventListener('unhandledrejection', (e) =>
  console.log('SPIKE_ERROR unhandledrejection: ' + String(e.reason)),
)

worker.postMessage({ reqId: 1, type: 'spike' })
