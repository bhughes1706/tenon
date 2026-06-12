import express from 'express'
import pino from 'pino'

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const port = Number(process.env.PORT ?? 3000)

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, version: process.env.npm_package_version ?? '0.0.1' })
})

// Chunk 3: SQLite migrations + REST skeleton
// Chunk 4: MCP stub + photo pipeline + bearer auth
// Chunk 13: apply_model_ops, get_model, validate_model MCP tools

app.listen(port, () => {
  log.info({ port }, 'tenon server listening')
})
