import type { RequestHandler } from 'express'
import crypto from 'crypto'

// §16.6: All /mcp requests require Authorization: Bearer <token>.
// Token is a 32-byte hex random stored in MCP_BEARER_TOKEN env var.
// Timing-safe compare prevents leaking token length via timing.
export function bearerAuth(): RequestHandler {
  return (req, res, next) => {
    const expected = process.env.MCP_BEARER_TOKEN
    if (!expected) {
      res.status(503).json({ error: 'MCP_BEARER_TOKEN not configured' })
      return
    }
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Bearer token required' })
      return
    }
    const provided = header.slice(7)
    let valid = false
    try {
      // timingSafeEqual requires equal-length buffers; mismatch throws → invalid
      valid = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    } catch {
      valid = false
    }
    if (!valid) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    next()
  }
}
