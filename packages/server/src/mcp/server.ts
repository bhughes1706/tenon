import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import type { Request, Response } from 'express'
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import { processPhoto } from '../lib/processPhoto.js'
import {
  makeJobId, makeClientId, makeNoteId, makeTimeLogId, makePhotoId,
} from '@tenon/core'

// §16.6: append mutating tool calls to mcp-audit.log (pino NDJSON)
export function makeAuditLog(dataDir: string): pino.Logger {
  return pino({ level: 'info' }, pino.destination(path.join(dataDir, 'mcp-audit.log')))
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

const text = (obj: unknown): ContentBlock => ({ type: 'text', text: JSON.stringify(obj) })
const err = (msg: string) => ({ content: [text({ error: msg })] as ContentBlock[], isError: true as const })

function buildMcpServer(auditLog: pino.Logger, dataDir: string): McpServer {
  const server = new McpServer({ name: 'tenon', version: '0.0.1' })

  // ── list_jobs ─────────────────────────────────────────────────────────────
  server.registerTool('list_jobs', {
    description: 'List jobs with summary counts. Optionally filter by status.',
    inputSchema: {
      status: z.enum(['lead', 'bid', 'accepted', 'in_progress', 'delivered', 'paid', 'archived']).optional(),
    },
  }, async ({ status }) => {
    const db = getDb()
    const params: string[] = []
    let sql = `
      SELECT j.id, j.title, j.status, j.due_date, j.payment_status,
             c.name AS client_name,
             (SELECT COUNT(*) FROM notes    WHERE job_id = j.id) AS note_count,
             (SELECT COUNT(*) FROM photos   WHERE job_id = j.id) AS photo_count,
             (SELECT COUNT(*) FROM models   WHERE job_id = j.id) AS model_count
      FROM jobs j LEFT JOIN clients c ON j.client_id = c.id`
    if (status) { sql += ' WHERE j.status = ?'; params.push(status) }
    sql += ' ORDER BY j.created_at DESC'
    const jobs = db.prepare(sql).all(...params)
    return { content: [text(jobs)] }
  })

  // ── get_job ───────────────────────────────────────────────────────────────
  server.registerTool('get_job', {
    description: 'Get a job by ID — includes notes, time summary by category, photo index, and model ids.',
    inputSchema: { job_id: z.string() },
  }, async ({ job_id }) => {
    const db = getDb()
    const job = db.prepare(
      'SELECT j.*, c.name AS client_name FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.id = ?'
    ).get(job_id)
    if (!job) return err('job not found')
    const notes = db.prepare('SELECT * FROM notes WHERE job_id = ? ORDER BY created_at DESC').all(job_id)
    const timeByCategory = db.prepare(
      'SELECT category, SUM(minutes) AS total_minutes FROM time_logs WHERE job_id = ? GROUP BY category'
    ).all(job_id)
    const photos = db.prepare(
      "SELECT id, caption, taken_at, uploaded_at FROM photos WHERE job_id = ? ORDER BY COALESCE(taken_at, uploaded_at) DESC"
    ).all(job_id)
    const models = db.prepare('SELECT id, name, rev FROM models WHERE job_id = ?').all(job_id)
    return { content: [text({ ...job as object, notes, time_by_category: timeByCategory, photos, models })] }
  })

  // ── create_job ────────────────────────────────────────────────────────────
  server.registerTool('create_job', {
    description: 'Create a job. If client_name is given, matches an existing client (case-insensitive) or creates one.',
    inputSchema: {
      title: z.string(),
      client_name: z.string().optional(),
      status: z.enum(['lead', 'bid', 'accepted', 'in_progress', 'delivered', 'paid', 'archived']).optional(),
      due_date: z.string().optional(),
      notes: z.string().optional(),
    },
  }, async ({ title, client_name, status = 'lead', due_date, notes }) => {
    auditLog.info({ tool: 'create_job', title, client_name }, 'mcp mutating call')
    const db = getDb()
    let clientId: string | null = null
    const id = makeJobId()
    const now = new Date().toISOString()
    db.transaction(() => {
      if (client_name) {
        const existing = db.prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)').get(client_name) as { id: string } | undefined
        if (existing) {
          clientId = existing.id
        } else {
          clientId = makeClientId()
          db.prepare('INSERT INTO clients (id, name, created_at) VALUES (?, ?, ?)').run(clientId, client_name, now)
        }
      }
      db.prepare(
        'INSERT INTO jobs (id, client_id, title, status, due_date, notes, payment_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, clientId, title, status, due_date ?? null, notes ?? null, 'unpaid', now, now)
    })()
    emitSse('job_changed', { id, event: 'created' })
    return { content: [text(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id))] }
  })

  // ── update_job ────────────────────────────────────────────────────────────
  server.registerTool('update_job', {
    description: 'Patch job fields. All fields are optional.',
    inputSchema: {
      job_id: z.string(),
      title: z.string().optional(),
      status: z.enum(['lead', 'bid', 'accepted', 'in_progress', 'delivered', 'paid', 'archived']).optional(),
      due_date: z.string().optional(),
      notes: z.string().optional(),
      deposit_pct: z.number().min(0).max(100).optional(),
      deposit_paid_at: z.string().optional(),
      payment_status: z.enum(['unpaid', 'deposit_received', 'paid_in_full']).optional(),
    },
  }, async ({ job_id, title, status, due_date, notes, deposit_pct, deposit_paid_at, payment_status }) => {
    auditLog.info({ tool: 'update_job', job_id }, 'mcp mutating call')
    const db = getDb()
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)) return err('job not found')
    // COALESCE patch: omitted/null fields keep their current value. There is no
    // way to explicitly clear a nullable field (e.g. due_date) via this tool.
    const now = new Date().toISOString()
    db.prepare(`UPDATE jobs SET
      title          = COALESCE(?, title),
      status         = COALESCE(?, status),
      due_date       = COALESCE(?, due_date),
      notes          = COALESCE(?, notes),
      deposit_pct    = COALESCE(?, deposit_pct),
      deposit_paid_at = COALESCE(?, deposit_paid_at),
      payment_status = COALESCE(?, payment_status),
      updated_at     = ?
      WHERE id = ?`).run(
      title ?? null, status ?? null, due_date ?? null, notes ?? null,
      deposit_pct ?? null, deposit_paid_at ?? null, payment_status ?? null,
      now, job_id,
    )
    emitSse('job_changed', { id: job_id, event: 'updated' })
    return { content: [text(db.prepare('SELECT * FROM jobs WHERE id = ?').get(job_id))] }
  })

  // ── log_note ──────────────────────────────────────────────────────────────
  server.registerTool('log_note', {
    description: 'Append a note to a job.',
    inputSchema: {
      job_id: z.string(),
      body: z.string(),
    },
  }, async ({ job_id, body }) => {
    auditLog.info({ tool: 'log_note', job_id }, 'mcp mutating call')
    const db = getDb()
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)) return err('job not found')
    const id = makeNoteId()
    db.prepare('INSERT INTO notes (id, job_id, body, created_at) VALUES (?, ?, ?, ?)').run(id, job_id, body, new Date().toISOString())
    emitSse('job_changed', { id: job_id, event: 'note_added' })
    return { content: [text(db.prepare('SELECT * FROM notes WHERE id = ?').get(id))] }
  })

  // ── log_time ──────────────────────────────────────────────────────────────
  server.registerTool('log_time', {
    description: 'Log time on a job. category: design|milling|joinery|assembly|finishing|install|other.',
    inputSchema: {
      job_id: z.string(),
      minutes: z.number().int().positive(),
      category: z.enum(['design', 'milling', 'joinery', 'assembly', 'finishing', 'install', 'other']).optional(),
      note: z.string().optional(),
    },
  }, async ({ job_id, minutes, category, note }) => {
    auditLog.info({ tool: 'log_time', job_id, minutes }, 'mcp mutating call')
    const db = getDb()
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)) return err('job not found')
    const id = makeTimeLogId()
    db.prepare('INSERT INTO time_logs (id, job_id, minutes, category, note, logged_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, job_id, minutes, category ?? null, note ?? null, new Date().toISOString())
    emitSse('job_changed', { id: job_id, event: 'time_logged' })
    return { content: [text(db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id))] }
  })

  // ── get_photos ────────────────────────────────────────────────────────────
  server.registerTool('get_photos', {
    description: 'Get photos for a job. Returns thumbnail images as base64 image blocks plus metadata. Use since/limit for pagination.',
    inputSchema: {
      job_id: z.string(),
      since: z.string().optional(),
      limit: z.number().int().positive().max(20).default(6),
    },
  }, async ({ job_id, since, limit }) => {
    const db = getDb()
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)) return err('job not found')

    const params: unknown[] = [job_id]
    let sql = 'SELECT * FROM photos WHERE job_id = ?'
    if (since) { sql += ' AND uploaded_at > ?'; params.push(since) }
    sql += ' ORDER BY COALESCE(taken_at, uploaded_at) DESC LIMIT ?'
    params.push(limit)

    type PhotoRow = { id: string; path: string; thumb_path: string | null; caption: string | null; taken_at: string | null; uploaded_at: string }
    const photos = db.prepare(sql).all(...params) as PhotoRow[]

    if (photos.length === 0) return { content: [text({ message: 'no photos', job_id })] }

    const content: ContentBlock[] = []
    for (const photo of photos) {
      content.push(text({ id: photo.id, caption: photo.caption, taken_at: photo.taken_at, uploaded_at: photo.uploaded_at }))
      if (photo.thumb_path) {
        const abs = path.isAbsolute(photo.thumb_path) ? photo.thumb_path : path.join(dataDir, photo.thumb_path)
        if (fs.existsSync(abs)) {
          content.push({ type: 'image', data: fs.readFileSync(abs).toString('base64'), mimeType: 'image/webp' })
        }
      }
    }
    return { content }
  })

  // ── upload_photo ──────────────────────────────────────────────────────────
  server.registerTool('upload_photo', {
    description: 'Upload a photo for a job. image must be base64-encoded JPEG or PNG. Generates a 512px WebP thumbnail and extracts EXIF date.',
    inputSchema: {
      job_id: z.string(),
      image: z.string().min(1),
      caption: z.string().optional(),
    },
  }, async ({ job_id, image, caption }) => {
    auditLog.info({ tool: 'upload_photo', job_id }, 'mcp mutating call')
    const db = getDb()
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(job_id)) return err('job not found')

    let buf: Buffer
    try {
      buf = Buffer.from(image, 'base64')
      if (buf.length === 0) throw new Error('empty buffer')
    } catch {
      return err('invalid base64 image data')
    }

    const photoId = makePhotoId()
    let result
    try {
      result = await processPhoto(buf, dataDir, job_id, photoId)
    } catch (e) {
      return err(`image processing failed: ${e instanceof Error ? e.message : String(e)}`)
    }

    const now = new Date().toISOString()
    try {
      db.prepare('INSERT INTO photos (id, job_id, path, thumb_path, caption, taken_at, uploaded_at, exif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(photoId, job_id, result.photoPath, result.thumbPath, caption ?? null, result.takenAt, now, result.exifJson)
    } catch (e) {
      for (const p of [result.photoPath, result.thumbPath]) {
        try { fs.unlinkSync(path.join(dataDir, p)) } catch { /* already gone */ }
      }
      return err(`database insert failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    emitSse('photo_added', { job_id, photo_id: photoId })
    return { content: [text(db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId))] }
  })

  return server
}

// Create one server instance + transport per request (stateless §16.6).
export async function handleMcpRequest(
  req: Request,
  res: Response,
  auditLog: pino.Logger,
  dataDir: string,
): Promise<void> {
  const server = buildMcpServer(auditLog, dataDir)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => { server.close().catch(() => {}) })
  await server.connect(transport)
  // req/res extend IncomingMessage/ServerResponse — the transport accepts them directly
  await transport.handleRequest(req as never, res as never, req.body)
}
