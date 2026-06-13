import { Router } from 'express'
import { getDb } from '../db.js'
import { makeClientId } from '@tenon/core'

const router: Router = Router()

router.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM clients ORDER BY name').all()
  res.json(rows)
})

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(row)
})

router.post('/', (req, res) => {
  const { name, contact, notes } = req.body as Record<string, string | undefined>
  if (!name) return res.status(400).json({ error: 'name is required' })
  const id = makeClientId()
  const now = new Date().toISOString()
  getDb()
    .prepare('INSERT INTO clients (id, name, contact, notes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, contact ?? null, notes ?? null, now)
  res.status(201).json(getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id))
})

router.patch('/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })
  const { name, contact, notes } = req.body as Record<string, string | undefined>
  db.prepare('UPDATE clients SET name = COALESCE(?, name), contact = COALESCE(?, contact), notes = COALESCE(?, notes) WHERE id = ?')
    .run(name ?? null, contact ?? null, notes ?? null, req.params.id)
  res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id))
})

export default router
