import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { getDb } from '../db.js'
import { ApplyOpsRequestSchema } from '@tenon/core'
import type { Model, OpResult } from '@tenon/core'
import { applyOpsCommit, createModel, getCutlist, loadModel } from '../lib/modelService.js'
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

// PATCH meta only — board/joint edits go through /ops (§10)
router.patch('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT doc FROM models WHERE id = ?').get(req.params.id) as { doc: string } | undefined
  if (!row) return res.status(404).json({ error: 'not found' })
  const { name, job_id } = req.body as Record<string, string | undefined>
  const now = new Date().toISOString()
  // `name` is duplicated in the `models.name` column (for list queries) and `doc.name`
  // (for the designer, which reads the whole doc) — keep both in sync or they drift.
  if (name !== undefined) {
    const doc = JSON.parse(row.doc) as Model
    doc.name = name
    doc.meta.updated_at = now
    db.prepare('UPDATE models SET name = ?, job_id = COALESCE(?, job_id), doc = ?, updated_at = ? WHERE id = ?')
      .run(name, job_id ?? null, JSON.stringify(doc), now, req.params.id)
  } else {
    db.prepare('UPDATE models SET job_id = COALESCE(?, job_id), updated_at = ? WHERE id = ?')
      .run(job_id ?? null, now, req.params.id)
  }
  res.json(db.prepare('SELECT id, job_id, name, rev, thumbnail, created_at, updated_at FROM models WHERE id = ?').get(req.params.id))
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
