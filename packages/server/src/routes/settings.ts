import { Router } from 'express'
import { getDb } from '../db.js'

const router: Router = Router()

// GET all settings — returns { key: parsedValue } map
router.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, unknown> = {}
  for (const { key, value } of rows) {
    try { result[key] = JSON.parse(value) } catch { result[key] = value }
  }
  res.json(result)
})

// PATCH key/value pairs — body: { theme: "dark", snap_grid: 0.03125, ... }
// Values are stored as JSON scalars; objects are allowed for future keys.
router.patch('/', (req, res) => {
  const db = getDb()
  const body = req.body as Record<string, unknown>
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'body must be a key/value object' })
  }

  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction((pairs: [string, string][]) => {
    for (const [k, v] of pairs) upsert.run(k, v)
  })

  const pairs: [string, string][] = Object.entries(body).map(([k, v]) => [k, JSON.stringify(v)])
  tx(pairs)

  // Return updated settings map
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result: Record<string, unknown> = {}
  for (const { key, value } of rows) {
    try { result[key] = JSON.parse(value) } catch { result[key] = value }
  }
  res.json(result)
})

export default router
