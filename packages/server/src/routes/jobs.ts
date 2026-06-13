import { Router } from 'express'
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import { makeJobId } from '@tenon/core'

const router: Router = Router()

const JOB_STATUSES = ['lead', 'bid', 'accepted', 'in_progress', 'delivered', 'paid', 'archived'] as const
const PAYMENT_STATUSES = ['unpaid', 'deposit_received', 'paid_in_full'] as const

router.get('/', (req, res) => {
  const db = getDb()
  const { status, client_id } = req.query as Record<string, string | undefined>
  let sql = 'SELECT * FROM jobs'
  const params: string[] = []
  const conditions: string[] = []
  if (status) { conditions.push('status = ?'); params.push(status) }
  if (client_id) { conditions.push('client_id = ?'); params.push(client_id) }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id)
  if (!job) return res.status(404).json({ error: 'not found' })
  const notes = db.prepare('SELECT * FROM notes WHERE job_id = ? ORDER BY created_at DESC').all(req.params.id)
  const timeLogs = db.prepare('SELECT * FROM time_logs WHERE job_id = ? ORDER BY logged_at DESC').all(req.params.id)
  const photos = db.prepare('SELECT * FROM photos WHERE job_id = ? ORDER BY uploaded_at DESC').all(req.params.id)
  const models = db.prepare('SELECT id, name, rev, thumbnail, created_at, updated_at FROM models WHERE job_id = ?').all(req.params.id)
  res.json({ ...job as object, notes, time_logs: timeLogs, photos, models })
})

router.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>
  const { title, client_id, status = 'lead', due_date, notes, deposit_pct, payment_status = 'unpaid' } = body
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' })
  if (status && !JOB_STATUSES.includes(status as typeof JOB_STATUSES[number])) {
    return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}` })
  }
  const id = makeJobId()
  const now = new Date().toISOString()
  getDb().prepare(
    'INSERT INTO jobs (id, client_id, title, status, deposit_pct, payment_status, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, client_id ?? null, title, status, deposit_pct ?? null, payment_status, due_date ?? null, notes ?? null, now, now)
  emitSse('job_changed', { id, event: 'created' })
  res.status(201).json(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id))
})

router.patch('/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })
  const body = req.body as Record<string, unknown>
  const { title, client_id, status, due_date, notes, deposit_pct, deposit_paid_at, payment_status } = body
  if (status && !JOB_STATUSES.includes(status as typeof JOB_STATUSES[number])) {
    return res.status(400).json({ error: `status must be one of: ${JOB_STATUSES.join(', ')}` })
  }
  if (payment_status && !PAYMENT_STATUSES.includes(payment_status as typeof PAYMENT_STATUSES[number])) {
    return res.status(400).json({ error: `payment_status must be one of: ${PAYMENT_STATUSES.join(', ')}` })
  }
  const now = new Date().toISOString()
  db.prepare(`UPDATE jobs SET
    title = COALESCE(?, title),
    client_id = COALESCE(?, client_id),
    status = COALESCE(?, status),
    due_date = COALESCE(?, due_date),
    notes = COALESCE(?, notes),
    deposit_pct = COALESCE(?, deposit_pct),
    deposit_paid_at = COALESCE(?, deposit_paid_at),
    payment_status = COALESCE(?, payment_status),
    updated_at = ?
    WHERE id = ?`
  ).run(title ?? null, client_id ?? null, status ?? null, due_date ?? null, notes ?? null,
    deposit_pct ?? null, deposit_paid_at ?? null, payment_status ?? null, now, req.params.id)
  emitSse('job_changed', { id: req.params.id, event: 'updated' })
  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id))
})

export default router
