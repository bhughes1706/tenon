import express from 'express'
import path from 'path'
import pino from 'pino'
import rateLimit from 'express-rate-limit'
import { openDb } from './db.js'
import { makePhotosRouter } from './routes/photos.js'
import clientsRouter from './routes/clients.js'
import jobsRouter from './routes/jobs.js'
import modelsRouter from './routes/models.js'
import hardwareRouter from './routes/hardware.js'
import settingsRouter from './routes/settings.js'
import speciesRouter from './routes/species.js'
import timeLogsRouter from './routes/timeLogs.js'
import notesRouter from './routes/notes.js'
import eventsRouter from './routes/events.js'
import { bearerAuth } from './middleware/bearerAuth.js'
import { handleMcpRequest, makeAuditLog } from './mcp/server.js'

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
})

const port = Number(process.env.PORT ?? 3000)
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(__dirname, '../../data'))

// Initialize DB and run pending migrations before accepting traffic
openDb(dataDir)
log.info({ dataDir }, 'database ready')

const auditLog = makeAuditLog(dataDir)

const app = express()
app.use(express.json({ limit: '1mb' }))

// Disable "X-Powered-By: Express" header
app.disable('x-powered-by')

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, version: process.env.npm_package_version ?? '0.0.1' })
})

// ── REST API (/api/*) — tailscale serve, tailnet-only (§10) ──────────────────
app.use('/api/clients', clientsRouter)
app.use('/api/jobs', jobsRouter)
app.use('/api/models', modelsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/species', speciesRouter)
app.use('/api/time_logs', timeLogsRouter)
app.use('/api/notes', notesRouter)
app.use('/api/events', eventsRouter)

// Photo routes span two path patterns (/api/jobs/:id/photos and /api/photos/:id)
// so they're wired at /api rather than a sub-router prefix
app.use('/api', makePhotosRouter(dataDir))

// Hardware similarly spans /api/jobs/:id/hardware and /api/hardware/:id
app.use('/api', hardwareRouter)

// ── MCP (/mcp) — Tailscale Funnel-exposed, bearer token required (§16.6) ─────
// §16.6: 60 req/min per IP; render_view gets an additional 10/min cap (chunk 14)
const mcpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

app.use('/mcp', mcpRateLimit, bearerAuth(), async (req, res, next) => {
  try {
    await handleMcpRequest(req, res, auditLog, dataDir)
  } catch (err) {
    next(err)
  }
})

// Terminal error handler — Express 5 forwards sync throws from route handlers here.
// Returns consistent { error } JSON instead of the default HTML 500, including FK
// violations from better-sqlite3 (foreign_keys=ON).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'internal server error'
  log.error({ err }, 'unhandled error')
  if (!res.headersSent) res.status(500).json({ error: message })
})

app.listen(port, () => {
  log.info({ port }, 'tenon server listening')
})
