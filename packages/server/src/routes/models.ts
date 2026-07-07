import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getDb } from '../db.js'
import { ApplyOpsRequestSchema } from '@tenon/core'
import type { OpResult } from '@tenon/core'
import {
  applyOpsCommit, createModel, deleteModel, getCutlist, loadModel, updateModelMeta,
} from '../lib/modelService.js'
import { renderModelView, RENDER_VIEWS, type RenderView } from '../lib/renderView.js'

// Thin REST adapters over lib/modelService.ts (chunk 11) — the same service backs
// the MCP model tools, so REST and MCP cannot drift (§11 "same §4.2 response shape").
const router: Router = Router()

router.get('/', (req, res) => {
  const db = getDb()
  const { job_id } = req.query as Record<string, string | undefined>
  let sql = 'SELECT id, job_id, name, rev, thumbnail, created_at, updated_at FROM models'
  const params: string[] = []
  if (job_id) { sql += ' WHERE job_id = ?'; params.push(job_id) }
  sql += ' ORDER BY updated_at DESC'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json({ ...row, doc: JSON.parse(row.doc as string) })
})

router.post('/', (req, res) => {
  const { name, job_id } = req.body as Record<string, string | undefined>
  if (!name) return res.status(400).json({ error: 'name is required' })
  res.status(201).json(createModel(name, job_id ?? null).row)
})

// PATCH meta only — board/joint edits go through /ops (§10). `job_id` distinguishes
// absent (leave assignment untouched) from explicit `null` (clear it) via `in`,
// since JSON.parse preserves an explicit null but drops an absent key.
router.patch('/:id', (req, res) => {
  const body = req.body as Record<string, unknown>
  const patch: { name?: string; job_id?: string | null } = {}
  if (typeof body.name === 'string') patch.name = body.name
  if ('job_id' in body) patch.job_id = (body.job_id as string | null | undefined) ?? null

  const outcome = updateModelMeta(req.params.id, patch)
  if (!outcome.ok) {
    if (outcome.reason === 'not_found') return res.status(404).json({ error: 'not found' })
    return res.status(400).json({ error: 'unknown job_id' })
  }
  res.json(outcome.row)
})

// DELETE /api/models/:id — detaches referencing hardware rows, drops snapshots,
// removes the model. No confirmation server-side; the designer's delete menu item
// is the confirmation surface (§ web UI).
router.delete('/:id', (req, res) => {
  if (!deleteModel(req.params.id)) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// POST /api/models/:id/ops — the parametric edit channel (§4.2 + §10)
router.post('/:id/ops', (req, res) => {
  // Body-shape validation stays at the REST boundary so a malformed request gets
  // field-path errors; the ops themselves re-enter the service as unknown[]
  // (validateOps step 1 is the authoritative parse for both REST and MCP).
  const bodyParse = ApplyOpsRequestSchema.safeParse(req.body)
  if (!bodyParse.success) {
    const model = loadModel(req.params.id)
    if (!model) return res.status(404).json({ error: 'not found' })
    const result: OpResult = {
      ok: false,
      rev: model.rev,
      applied: [],
      warnings: [],
      errors: bodyParse.error.issues.map(i => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message),
    }
    return res.status(422).json(result)
  }

  const { expected_rev, ops } = bodyParse.data
  const outcome = applyOpsCommit(req.params.id, expected_rev, ops)
  if (!outcome) return res.status(404).json({ error: 'not found' })
  res.status(outcome.status).json(outcome.result)
})

// GET /api/models/:id/cutlist — §7 cut list (rows + per-species materials + total cost).
// The same core generateCutlist() backs the live web panel; here it runs server-side for
// MCP/bid/headless use. Species cost + kind come from the species table, waste factors +
// fraction precision from settings.
router.get('/:id/cutlist', (req, res) => {
  const result = getCutlist(req.params.id)
  if (!result) return res.status(404).json({ error: 'not found' })
  res.json(result)
})

// GET /api/models/:id/render.png?view=iso&w=900&highlight=brd_a,brd_b — §11.3.
// Puppeteer renders the server's own SPA in render mode; §16.6 caps this at
// 10/min on top of the global limit (each render costs ~1–2 s of software GL).
const renderLimit = rateLimit({ windowMs: 60 * 1000, max: 10 })
router.get('/:id/render.png', renderLimit, async (req, res) => {
  // Cast: express 5's type-level path parser mis-infers `:id` followed by a
  // `.png` literal as string|string[] — at runtime it is always a string.
  const id = (req.params as { id: string }).id
  if (!loadModel(id)) return res.status(404).json({ error: 'not found' })
  const { view: rawView, w, highlight } = req.query as Record<string, string | undefined>
  const view = (RENDER_VIEWS as readonly string[]).includes(rawView ?? 'iso') ? ((rawView ?? 'iso') as RenderView) : null
  if (!view) return res.status(400).json({ error: `view must be one of ${RENDER_VIEWS.join('|')}` })
  const width = Math.min(1600, Math.max(200, Number(w) || 900))
  try {
    const png = await renderModelView({
      modelId: id,
      view,
      width,
      highlight: highlight?.split(',').filter(Boolean),
    })
    res.type('png').send(png)
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : 'render failed' })
  }
})

export default router
