import type { Response } from 'express'

export type SseEventName = 'model_changed' | 'photo_added' | 'job_changed'

const clients = new Set<Response>()

export function registerSseClient(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send an initial comment to confirm the connection
  res.write(': connected\n\n')

  clients.add(res)
  res.on('close', () => clients.delete(res))
}

export function emitSse(event: SseEventName, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    res.write(payload)
  }
}
