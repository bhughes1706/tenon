import { Router } from 'express'
import { getDb } from '../db.js'
import { makeNoteId } from '@tenon/core'

const router: Router = Router()

router.get('/', (req, res) => {
  const { job_id } = req.query as Record<string, string | undefined>
  let sql = 'SELECT * FROM notes'
  const params: string[] = []
  if (job_id) { sql += ' WHERE job_id = ?'; params.push(job_id) }
  sql += ' ORDER BY created_at DESC'
  res.json(getDb().prepare(sql).all(...params))
})

router.post('/', (req, res) => {
  const db = getDb()
  const { job_id, body } = req.body as Record<string, string | undefined>
  if (!job_id) return res.status(400).json({ error: 'job_id is required' })
  if (!body) return res.status(400).json({ error: 'body is required' })
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)
  if (!job) return res.status(404).json({ error: 'job not found' })

  const id = makeNoteId()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO notes (id, job_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(id, job_id, body, now)
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id))
})

export default router
