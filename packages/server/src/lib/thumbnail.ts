// Model thumbnails (§15 row 14 remainder). render_view itself shipped in chunk
// 11 (docs/chunk11-design.md §8 explicitly deferred thumbnails to "chunk 14").
// Reuses the same Puppeteer render pipeline — an iso view at thumbnail width —
// and persists it as a data: URL in models.thumbnail (schema §9, TEXT column,
// no separate file the way photos.thumb_path works).
//
// Debounced per model: apply_model_ops commits land one per user action, but a
// drag or a multi-op batch can fire several in quick succession, and each
// render costs ~1-2s of software GL (§11.3) — only the settled doc is worth a
// render.
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import { renderModelView } from './renderView.js'

const THUMB_WIDTH = 240
const DEBOUNCE_MS = 1500

const pending = new Map<string, NodeJS.Timeout>()

export function scheduleThumbnail(modelId: string): void {
  // modelService's integration tests exercise applyOpsCommit hundreds of times
  // against a temp-dir DB with no real HTTP server behind it — scheduling real
  // Puppeteer launches from there would hang test teardown on the browser
  // singleton's open handle. Vitest sets this env var itself.
  if (process.env.VITEST) return
  const existing = pending.get(modelId)
  if (existing) clearTimeout(existing)
  pending.set(
    modelId,
    setTimeout(() => {
      pending.delete(modelId)
      void generateThumbnail(modelId)
    }, DEBOUNCE_MS),
  )
}

async function generateThumbnail(modelId: string): Promise<void> {
  try {
    const png = await renderModelView({ modelId, view: 'iso', width: THUMB_WIDTH })
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const info = getDb().prepare('UPDATE models SET thumbnail = ? WHERE id = ?').run(dataUrl, modelId)
    if (info.changes > 0) emitSse('model_changed', { id: modelId, event: 'thumbnail' })
  } catch (e) {
    // Best-effort — the render needs the built web bundle next to the server
    // (dist/web, §11.3 dev caveat), so this fails every time in an unbuilt dev
    // setup. Never let a thumbnail miss affect the edit that triggered it.
    console.error(`thumbnail: render failed for model ${modelId}:`, e instanceof Error ? e.message : e)
  }
}
