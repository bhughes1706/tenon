import type { RequestHandler } from 'express'
import crypto from 'crypto'

// §16.6: All /mcp requests require Authorization: Bearer <token>.
// Token is a 32-byte hex random stored in MCP_BEARER_TOKEN env var.
// Both sides are SHA-256 hashed to fixed-length digests before the timing-safe
// compare, so the comparison time is independent of the provided token's length
// (comparing the raw buffers would make timingSafeEqual throw on a length
// mismatch, and that early return leaks whether the length was right).
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
    // Hash to equal-length digests so the compare never throws and never varies
    // with the provided token's length.
    const providedHash = crypto.createHash('sha256').update(provided).digest()
    const expectedHash = crypto.createHash('sha256').update(expected).digest()
    const valid = crypto.timingSafeEqual(providedHash, expectedHash)
    if (!valid) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    next()
  }
}
