import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { bearerAuth } from './bearerAuth.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request
}

function mockRes() {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this },
    set(k: string, v: string) { this._headers[k] = v; return this },
    json(body: unknown) { this._body = body; return this },
  }
  return res
}

const TOKEN = 'a'.repeat(64) // 32 bytes hex

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bearerAuth', () => {
  beforeEach(() => {
    process.env.MCP_BEARER_TOKEN = TOKEN
  })
  afterEach(() => {
    delete process.env.MCP_BEARER_TOKEN
  })

  it('calls next() when the token matches', () => {
    const next = vi.fn()
    const handler = bearerAuth()
    handler(mockReq(`Bearer ${TOKEN}`), mockRes() as unknown as Response, next as NextFunction)
    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith() // no error argument
  })

  it('returns 401 when no Authorization header is present', () => {
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq(), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(401)
    expect(res._headers['WWW-Authenticate']).toBe('Bearer')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the token is wrong', () => {
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq('Bearer ' + 'b'.repeat(64)), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the Authorization scheme is not Bearer', () => {
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq(`Basic ${TOKEN}`), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token length differs (timing-safe path handles mismatch)', () => {
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq('Bearer short'), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 503 when MCP_BEARER_TOKEN is not configured', () => {
    delete process.env.MCP_BEARER_TOKEN
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq(`Bearer ${TOKEN}`), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Bearer token is an empty string', () => {
    const next = vi.fn()
    const res = mockRes()
    bearerAuth()(mockReq('Bearer '), res as unknown as Response, next as NextFunction)
    expect(res._status).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })
})
