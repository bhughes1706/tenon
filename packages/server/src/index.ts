import express from 'express'
import fs from 'fs'
import os from 'os'
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
// Without DATA_DIR set, default OUTSIDE the repo — `__dirname` at runtime is
// `dist/`, so a repo-relative default (e.g. `../../data`) used to land at
// `packages/data/`, inside the monorepo tree where it could be wiped by a
// repo-level clean or accidentally committed. Production always sets DATA_DIR
// via /etc/tenon/env; this default is only a safety net for ad-hoc runs.
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(os.homedir(), '.tenon', 'data'))

// Initialize DB and run pending migrations before accepting traffic
openDb(dataDir)
log.info({ dataDir }, 'database ready')

const auditLog = makeAuditLog(dataDir)

const app = express()
app.use(express.json({ limit: '1mb' }))

// Trust the loopback proxy only. Tailscale serve/Funnel proxies from localhost and
// sets X-Forwarded-For; without this, express-rate-limit v7 THROWS
// (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) on every proxied request — i.e. /mcp works
// locally but 500s the moment it's behind the Funnel. Trusting loopback also makes
// req.ip resolve to the real client from X-Forwarded-For, so the /mcp rate limit is
// actually per-client instead of a single global bucket.
app.set('trust proxy', 'loopback')

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
// §16.6: 60 req/min per IP overall. With `trust proxy` set above, req.ip is the
// real client, so this is genuinely per-client. Runs before bearerAuth as
// defense-in-depth — the auth check itself can't be hammered before a 401.
const mcpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

// §16.6: render_view is additionally capped at 10/min — Puppeteer software-GL
// renders are the one expensive tool. express.json already parsed the body, so we
// gate on the JSON-RPC tool name; every other call skips this limiter. Placed AFTER
// bearerAuth so only authenticated render calls consume the budget — an unauthorized
// flood can't lock the real user out of rendering (it's still bounded by the 60/min
// cap above and 401'd regardless).
const renderRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'render_view rate limit (10/min) exceeded, please try again later.' },
  skip: (req) => {
    const body = req.body as { method?: string; params?: { name?: string } } | undefined
    return !(body?.method === 'tools/call' && body.params?.name === 'render_view')
  },
})

app.use('/mcp', mcpRateLimit, bearerAuth(), renderRateLimit, async (req, res, next) => {
  try {
    await handleMcpRequest(req, res, auditLog, dataDir)
  } catch (err) {
    next(err)
  }
})

// An unknown /api/* route should 404 as JSON, not fall through to the SPA's
// index.html (the catch-all below would otherwise serve HTML for a typo'd or
// removed API path, which is confusing to debug from a fetch() call).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not found' })
})

// ── Static PWA ───────────────────────────────────────────────────────────────
// Serve built web assets from the sibling web/ dir in the deploy layout.
// Must come after /api and /mcp so those routes aren't shadowed.
const webDir = path.join(__dirname, '../web')
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDir, 'index.html')))
}

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
