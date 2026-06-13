import { Router } from 'express'
import { getDb } from '../db.js'

const router: Router = Router()

router.get('/', (_req, res) => {
  res.json(
    (getDb().prepare('SELECT * FROM species ORDER BY kind, common_name').all() as Array<Record<string, unknown>>)
      .map(parseThicknesses)
  )
})

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM species WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(parseThicknesses(row))
})

router.post('/', (req, res) => {
  const db = getDb()
  const body = req.body as Record<string, unknown>
  const { id, common_name, botanical, kind = 'solid', density_lb_ft3, janka_lbf,
          shrink_tan_pct, shrink_rad_pct, cost_bf, thicknesses, texture, notes } = body
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id is required (spc_*)' })
  if (!common_name || typeof common_name !== 'string') return res.status(400).json({ error: 'common_name is required' })
  if (cost_bf === undefined || cost_bf === null) return res.status(400).json({ error: 'cost_bf is required' })
  if (!thicknesses || !Array.isArray(thicknesses)) return res.status(400).json({ error: 'thicknesses must be an array' })

  db.prepare(`INSERT INTO species (id, common_name, botanical, kind, density_lb_ft3, janka_lbf,
    shrink_tan_pct, shrink_rad_pct, cost_bf, thicknesses, texture, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, common_name, botanical ?? null, kind, density_lb_ft3 ?? null, janka_lbf ?? null,
      shrink_tan_pct ?? null, shrink_rad_pct ?? null, cost_bf, JSON.stringify(thicknesses), texture ?? null, notes ?? null)

  const row = db.prepare('SELECT * FROM species WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json(parseThicknesses(row))
})

router.patch('/:id', (req, res) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM species WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })

  const body = req.body as Record<string, unknown>
  const { common_name, botanical, kind, density_lb_ft3, janka_lbf,
          shrink_tan_pct, shrink_rad_pct, cost_bf, thicknesses, texture, notes } = body

  db.prepare(`UPDATE species SET
    common_name = COALESCE(?, common_name),
    botanical = COALESCE(?, botanical),
    kind = COALESCE(?, kind),
    density_lb_ft3 = COALESCE(?, density_lb_ft3),
    janka_lbf = COALESCE(?, janka_lbf),
    shrink_tan_pct = COALESCE(?, shrink_tan_pct),
    shrink_rad_pct = COALESCE(?, shrink_rad_pct),
    cost_bf = COALESCE(?, cost_bf),
    thicknesses = COALESCE(?, thicknesses),
    texture = COALESCE(?, texture),
    notes = COALESCE(?, notes)
    WHERE id = ?`)
    .run(common_name ?? null, botanical ?? null, kind ?? null, density_lb_ft3 ?? null, janka_lbf ?? null,
      shrink_tan_pct ?? null, shrink_rad_pct ?? null, cost_bf ?? null,
      thicknesses ? JSON.stringify(thicknesses) : null, texture ?? null, notes ?? null, req.params.id)

  const row = db.prepare('SELECT * FROM species WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json(parseThicknesses(row))
})

function parseThicknesses(row: Record<string, unknown>): Record<string, unknown> {
  if (typeof row.thicknesses === 'string') {
    try { return { ...row, thicknesses: JSON.parse(row.thicknesses) } } catch { /* fall through */ }
  }
  return row
}

export default router
