import type { Model, Op, OpResult } from '@tenon/core'

// GET /api/models/:id returns the row with the model document parsed under `doc`.
export interface ModelRow {
  id: string
  job_id: string | null
  name: string
  rev: number
  doc: Model
  thumbnail: string | null
  created_at: string
  updated_at: string
}

export async function fetchModel(id: string): Promise<Model> {
  const res = await fetch(`/api/models/${id}`)
  if (!res.ok) throw new Error(`model ${id}: ${res.status}`)
  const row = (await res.json()) as ModelRow
  // doc.rev is kept in sync with the row by the ops endpoint (§3.3) — it is the
  // authoritative revision the next op must carry as expected_rev.
  return row.doc
}

// POST /api/models/:id/ops — the parametric edit channel (§4.2). The server
// returns the OpResult shape on success (200) and on rejection (409/422) alike,
// so callers branch on body.ok rather than the HTTP status.
export async function applyModelOps(
  id: string,
  expected_rev: number,
  ops: Op[],
): Promise<OpResult> {
  const res = await fetch(`/api/models/${id}/ops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_rev, ops }),
  })
  return (await res.json()) as OpResult
}
