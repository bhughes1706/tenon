import { Router } from 'express'
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import { makeModelId, ModelSchema, validateOps, recomputeWarnings, ApplyOpsRequestSchema } from '@tenon/core'
import type { Model, OpResult, Warning } from '@tenon/core'
import { applyOps } from '../lib/applyOps.js'

const router: Router = Router()

// Snapshot every 25 revisions — automatic safety net (§16.2 / §9)
const SNAPSHOT_INTERVAL = 25

function makeEmptyModel(id: string, name: string): Model {
  const now = new Date().toISOString()
  return {
    id,
    rev: 0,
    doc_version: 1,
    name,
    units: 'in',
    boards: [],
    joints: [],
    groups: [],
    meta: { notes: '', created_at: now, updated_at: now },
  }
}

function loadModel(id: string): Model | null {
  const db = getDb()
  const row = db.prepare('SELECT doc FROM models WHERE id = ?').get(id) as { doc: string } | undefined
  if (!row) return null
  const parsed = ModelSchema.safeParse(JSON.parse(row.doc))
  // Throws rather than returning null so the caller can distinguish "not found"
  // from "exists but corrupt/unmigrated" (§16.1 migrate-on-read lands in chunk 16).
  if (!parsed.success) throw new Error(`model ${id} doc schema mismatch — needs doc migration`)
  return parsed.data
}

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
  const db = getDb()
  const { name, job_id } = req.body as Record<string, string | undefined>
  if (!name) return res.status(400).json({ error: 'name is required' })
  const id = makeModelId()
  const now = new Date().toISOString()
  const model = makeEmptyModel(id, name)
  db.prepare(
    'INSERT INTO models (id, job_id, name, rev, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, job_id ?? null, name, 0, JSON.stringify(model), now, now)
  emitSse('model_changed', { id, event: 'created' })
  res.status(201).json({ id, job_id: job_id ?? null, name, rev: 0, doc: model, created_at: now, updated_at: now })
})

// PATCH meta only — board/joint edits go through /ops (§10)
router.patch('/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT doc FROM models WHERE id = ?').get(req.params.id) as { doc: string } | undefined
  if (!row) return res.status(404).json({ error: 'not found' })
  const { name, job_id } = req.body as Record<string, string | undefined>
  const now = new Date().toISOString()
  db.prepare('UPDATE models SET name = COALESCE(?, name), job_id = COALESCE(?, job_id), updated_at = ? WHERE id = ?')
    .run(name ?? null, job_id ?? null, now, req.params.id)
  res.json(db.prepare('SELECT id, job_id, name, rev, thumbnail, created_at, updated_at FROM models WHERE id = ?').get(req.params.id))
})

// POST /api/models/:id/ops — the parametric edit channel (§4.2 + §10)
router.post('/:id/ops', (req, res) => {
  const db = getDb()

  const model = loadModel(req.params.id)
  if (!model) return res.status(404).json({ error: 'not found' })

  const bodyParse = ApplyOpsRequestSchema.safeParse(req.body)
  if (!bodyParse.success) {
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

  // Fast pre-validation rejection — avoids paying validation cost on obvious stale reads (§3.3)
  if (expected_rev !== model.rev) {
    const result: OpResult = {
      ok: false,
      rev: model.rev,
      applied: [],
      warnings: [],
      errors: [`rev conflict: expected ${expected_rev}, current is ${model.rev}`],
    }
    return res.status(409).json(result)
  }

  // Steps 1–2: schema + referential integrity (steps 3–4 land with chunk 9)
  const validation = validateOps(ops, model)
  if (!validation.ok) {
    const result: OpResult = { ok: false, rev: model.rev, applied: [], warnings: [], errors: validation.errors }
    return res.status(422).json(result)
  }

  const { model: updated, applied } = applyOps(validation.ops, model)
  const now = new Date().toISOString()
  const newRev = updated.rev

  // CAS write — guards against a concurrent write landing between our load and this
  // transaction (the fast check above is outside the transaction, so the window exists).
  // `changes === 0` means another writer updated rev while we were validating (§3.3).
  const committed = db.transaction((): boolean => {
    const info = db.prepare('UPDATE models SET doc = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?')
      .run(JSON.stringify(updated), newRev, now, req.params.id, expected_rev)
    if (info.changes === 0) return false
    if (newRev % SNAPSHOT_INTERVAL === 0) {
      db.prepare('INSERT OR REPLACE INTO model_snapshots (model_id, rev, doc, created_at) VALUES (?, ?, ?, ?)')
        .run(req.params.id, newRev, JSON.stringify(updated), now)
    }
    return true
  })()

  if (!committed) {
    const current = db.prepare('SELECT rev FROM models WHERE id = ?').get(req.params.id) as { rev: number } | undefined
    const result: OpResult = {
      ok: false,
      rev: current?.rev ?? model.rev,
      applied: [],
      warnings: [],
      errors: [`rev conflict: concurrent write detected`],
    }
    return res.status(409).json(result)
  }

  // Step 4 (§6): the analytic collision pass over the committed model is the
  // AUTHORITY for UNRESOLVED_COLLISION (no Manifold in Node — warnings, not meshes).
  // Joined with the step-3 precondition re-derivation warnings from validateOps.
  const warnings: Warning[] = [...validation.warnings, ...recomputeWarnings(updated)]

  emitSse('model_changed', { id: req.params.id, rev: newRev })
  res.json({ ok: true, rev: newRev, applied, warnings, errors: [] } satisfies OpResult)
})

// GET /api/models/:id/cutlist — stub until chunk 15
router.get('/:id/cutlist', (req, res) => {
  const row = getDb().prepare('SELECT id FROM models WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  res.status(501).json({ error: 'cutlist engine not yet implemented (chunk 15)' })
})

export default router
