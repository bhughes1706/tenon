import { Router } from 'express'
import { getDb } from '../db.js'
import { makeHardwareId } from '@tenon/core'

const router: Router = Router()

const UNITS = ['ea', 'pair', 'set', 'box', 'ft'] as const

router.get('/jobs/:jobId/hardware', (req, res) => {
  const job = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'job not found' })
  res.json(getDb().prepare('SELECT * FROM hardware WHERE job_id = ? ORDER BY rowid').all(req.params.jobId))
})

router.post('/jobs/:jobId/hardware', (req, res) => {
  const db = getDb()
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'job not found' })

  const body = req.body as Record<string, unknown>
  const { item, qty = 1, unit = 'ea', unit_cost, supplier, notes, model_id } = body
  if (!item || typeof item !== 'string') return res.status(400).json({ error: 'item is required' })
  if (unit && !UNITS.includes(unit as typeof UNITS[number])) {
    return res.status(400).json({ error: `unit must be one of: ${UNITS.join(', ')}` })
  }

  const id = makeHardwareId()
  db.prepare(
    'INSERT INTO hardware (id, job_id, model_id, item, qty, unit, unit_cost, supplier, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.jobId, model_id ?? null, item, qty, unit, unit_cost ?? null, supplier ?? null, notes ?? null)
  res.status(201).json(db.prepare('SELECT * FROM hardware WHERE id = ?').get(id))
})

router.patch('/hardware/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM hardware WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })
  const { item, qty, unit, unit_cost, supplier, notes } = req.body as Record<string, unknown>
  if (unit && !UNITS.includes(unit as typeof UNITS[number])) {
    return res.status(400).json({ error: `unit must be one of: ${UNITS.join(', ')}` })
  }
  db.prepare(`UPDATE hardware SET
    item = COALESCE(?, item),
    qty = COALESCE(?, qty),
    unit = COALESCE(?, unit),
    unit_cost = COALESCE(?, unit_cost),
    supplier = COALESCE(?, supplier),
    notes = COALESCE(?, notes)
    WHERE id = ?`
  ).run(item ?? null, qty ?? null, unit ?? null, unit_cost ?? null, supplier ?? null, notes ?? null, req.params.id)
  res.json(db.prepare('SELECT * FROM hardware WHERE id = ?').get(req.params.id))
})

router.delete('/hardware/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM hardware WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })
  db.prepare('DELETE FROM hardware WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

export default router
