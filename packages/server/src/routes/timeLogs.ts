import { Router } from 'express'
import { getDb } from '../db.js'
import { makeTimeLogId, LaborCategory } from '@tenon/core'

const router: Router = Router()

const CATEGORIES = Object.values(LaborCategory)

router.get('/', (req, res) => {
  const { job_id } = req.query as Record<string, string | undefined>
  let sql = 'SELECT * FROM time_logs'
  const params: string[] = []
  if (job_id) { sql += ' WHERE job_id = ?'; params.push(job_id) }
  sql += ' ORDER BY logged_at DESC'
  res.json(getDb().prepare(sql).all(...params))
})

router.post('/', (req, res) => {
  const db = getDb()
  const body = req.body as Record<string, unknown>
  const { job_id, minutes, category, note } = body
  if (!job_id || typeof job_id !== 'string') return res.status(400).json({ error: 'job_id is required' })
  if (!minutes || typeof minutes !== 'number' || minutes <= 0) return res.status(400).json({ error: 'minutes must be a positive number' })
  if (category && !CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` })
  }
  const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)
  if (!job) return res.status(404).json({ error: 'job not found' })

  const id = makeTimeLogId()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO time_logs (id, job_id, minutes, category, note, logged_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, job_id, minutes, category ?? null, note ?? null, now)
  res.status(201).json(db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id))
})

export default router
