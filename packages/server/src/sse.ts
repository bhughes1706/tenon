import type { Response } from 'express'

export type SseEventName = 'model_changed' | 'photo_added' | 'photo_deleted' | 'job_changed'

const HEARTBEAT_MS = 30_000

const clients = new Set<Response>()

export function registerSseClient(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send an initial comment to confirm the connection
  res.write(': connected\n\n')

  clients.add(res)

  // Comment-only heartbeat — keeps intermediate proxies (Tailscale, browsers) from
  // silently timing out an idle connection, without the client seeing a real event.
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
      clients.delete(res)
    }
  }, HEARTBEAT_MS)

  res.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
}

export function emitSse(event: SseEventName, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}
