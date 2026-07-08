// §3.5 / §9 — router bit inventory REST. Mirrors routes/species.ts (list / get / create /
// patch); the bit store is inventory the designer curates, so unlike species it takes
// writes from the client (routes/species is read-mostly, seeded once).
import { Router } from 'express'
import { getDb } from '../db.js'

const router: Router = Router()

router.get('/', (_req, res) => {
  res.json(
    (getDb().prepare('SELECT * FROM bits ORDER BY profile, name').all() as Array<Record<string, unknown>>).map(parseGeom),
  )
})

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM bits WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!row) return res.status(404).json({ error: 'not found' })
  res.json(parseGeom(row))
})

// A `compound` bit carries its cross-section as a JSON segment path (§3.5 chunk 17.1);
// stored as TEXT, surfaced to the client as a parsed object.
const PROFILES = ['roundover', 'chamfer', 'cove', 'ogee', 'rabbet', 'compound']

function parseGeom(row: Record<string, unknown>): Record<string, unknown> {
  if (typeof row.profile_geom === 'string') {
    try { return { ...row, profile_geom: JSON.parse(row.profile_geom) } } catch { /* leave as-is */ }
  }
  return row
}

// Accept either a JSON string or an already-parsed object from the client.
function geomToText(v: unknown): string | null {
  if (v == null) return null
  return typeof v === 'string' ? v : JSON.stringify(v)
}

router.post('/', (req, res) => {
  const db = getDb()
  const body = req.body as Record<string, unknown>
  const { id, name, profile, radius, angle_deg, cut_width, cut_depth, shank = '1/4', brand, notes, profile_geom } = body
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id is required (bit_*)' })
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' })
  if (typeof profile !== 'string' || !PROFILES.includes(profile))
    return res.status(400).json({ error: `profile must be one of: ${PROFILES.join(', ')}` })
  if (db.prepare('SELECT 1 FROM bits WHERE id = ?').get(id))
    return res.status(409).json({ error: `bit '${id}' already exists` })

  db.prepare(`INSERT INTO bits (id, name, profile, radius, angle_deg, cut_width, cut_depth, shank, brand, notes, profile_geom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, profile, radius ?? null, angle_deg ?? null, cut_width ?? null, cut_depth ?? null, shank ?? '1/4', brand ?? null, notes ?? null, geomToText(profile_geom))

  res.status(201).json(parseGeom(db.prepare('SELECT * FROM bits WHERE id = ?').get(id) as Record<string, unknown>))
})

router.patch('/:id', (req, res) => {
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM bits WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'not found' })

  const body = req.body as Record<string, unknown>
  const { name, profile, radius, angle_deg, cut_width, cut_depth, shank, brand, notes, profile_geom } = body
  if (profile !== undefined && (typeof profile !== 'string' || !PROFILES.includes(profile)))
    return res.status(400).json({ error: `profile must be one of: ${PROFILES.join(', ')}` })

  db.prepare(`UPDATE bits SET
    name = COALESCE(?, name),
    profile = COALESCE(?, profile),
    radius = COALESCE(?, radius),
    angle_deg = COALESCE(?, angle_deg),
    cut_width = COALESCE(?, cut_width),
    cut_depth = COALESCE(?, cut_depth),
    shank = COALESCE(?, shank),
    brand = COALESCE(?, brand),
    notes = COALESCE(?, notes),
    profile_geom = COALESCE(?, profile_geom)
    WHERE id = ?`)
    .run(name ?? null, profile ?? null, radius ?? null, angle_deg ?? null, cut_width ?? null,
      cut_depth ?? null, shank ?? null, brand ?? null, notes ?? null, geomToText(profile_geom), req.params.id)

  res.json(parseGeom(db.prepare('SELECT * FROM bits WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

export default router
