import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import { processPhoto } from '../lib/processPhoto.js'
import { makePhotoId } from '@tenon/core'

// DATA_DIR is resolved at startup and injected via the router factory
export function makePhotosRouter(dataDir: string): Router {
  const router = Router()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

  router.get('/jobs/:jobId/photos', (req, res) => {
    const job = getDb().prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'job not found' })
    const photos = getDb()
      .prepare('SELECT * FROM photos WHERE job_id = ? ORDER BY COALESCE(taken_at, uploaded_at) DESC')
      .all(req.params.jobId)
    res.json(photos)
  })

  router.post('/jobs/:jobId/photos', upload.single('photo'), async (req, res) => {
    const db = getDb()
    const job = db.prepare('SELECT id FROM jobs WHERE id = ?').get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'job not found' })
    if (!req.file) return res.status(400).json({ error: 'photo file required (field: photo)' })

    const photoId = makePhotoId()
    const result = await processPhoto(req.file.buffer, dataDir, String(req.params.jobId), photoId)
    const caption = typeof req.body.caption === 'string' ? req.body.caption : null
    const now = new Date().toISOString()

    db.prepare('INSERT INTO photos (id, job_id, path, thumb_path, caption, taken_at, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(photoId, req.params.jobId, result.photoPath, result.thumbPath, caption, result.takenAt, now)

    emitSse('photo_added', { job_id: req.params.jobId, photo_id: photoId })
    res.status(201).json(db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId))
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
    const target = row.thumb_path ?? row.path
    const abs = path.isAbsolute(target) ? target : path.join(dataDir, target)
    res.sendFile(abs)
  })

  router.delete('/photos/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as { id: string; job_id: string; path: string; thumb_path: string | null } | undefined
    if (!row) return res.status(404).json({ error: 'not found' })

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id)

    for (const p of [row.path, row.thumb_path].filter(Boolean) as string[]) {
      const abs = path.isAbsolute(p) ? p : path.join(dataDir, p)
      try { fs.unlinkSync(abs) } catch { /* file already gone */ }
    }

    emitSse('photo_added', { job_id: row.job_id, photo_id: row.id, event: 'deleted' })
    res.status(204).send()
  })

  return router
}
