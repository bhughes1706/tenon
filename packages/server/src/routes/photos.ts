import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'

// DATA_DIR is resolved at startup and injected via the router factory
export function makePhotosRouter(dataDir: string): Router {
  const router = Router()

  router.get('/jobs/:jobId/photos', (req, res) => {
    const job = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'job not found' })
    const photos = getDb()
      .prepare('SELECT * FROM photos WHERE job_id = ? ORDER BY uploaded_at DESC')
      .all(req.params.jobId)
    res.json(photos)
  })

  // Photo upload is implemented in chunk 4 (photo pipeline: sharp, EXIF, thumbnails)
  router.post('/jobs/:jobId/photos', (_req, res) => {
    res.status(501).json({ error: 'photo upload implemented in chunk 4 (sharp + EXIF pipeline)' })
  })

  router.get('/photos/:id', (req, res) => {
    const row = getDb().prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as { path: string } | undefined
    if (!row) return res.status(404).json({ error: 'not found' })
    const abs = path.isAbsolute(row.path) ? row.path : path.join(dataDir, row.path)
    res.sendFile(abs)
  })

  router.get('/photos/:id/thumb', (req, res) => {
    const row = getDb().prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as { path: string; thumb_path: string | null } | undefined
    if (!row) return res.status(404).json({ error: 'not found' })
    // Fall back to full photo if thumbnail hasn't been generated yet (chunk 4)
    const target = row.thumb_path ?? row.path
    const abs = path.isAbsolute(target) ? target : path.join(dataDir, target)
    res.sendFile(abs)
  })

  router.delete('/photos/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as { id: string; job_id: string; path: string; thumb_path: string | null } | undefined
    if (!row) return res.status(404).json({ error: 'not found' })

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id)

    // Best-effort file deletion — don't fail the request if files are already gone
    for (const p of [row.path, row.thumb_path].filter(Boolean) as string[]) {
      const abs = path.isAbsolute(p) ? p : path.join(dataDir, p)
      try { fs.unlinkSync(abs) } catch { /* file already gone */ }
    }

    emitSse('photo_added', { job_id: row.job_id, photo_id: row.id, event: 'deleted' })
    res.status(204).send()
  })

  return router
}
