// Shared model pipeline (chunk 11) — ONE implementation of the §4.2 ops commit,
// model CRUD, and cut-list assembly, consumed by BOTH the REST routes
// (routes/models.ts) and the MCP model tools (mcp/server.ts). Splitting the two
// surfaces would eventually drift them; the §11 design rule is that every write
// tool returns the same OpResult shape the REST channel does.
//
// Everything here is base @tenon/core (analytic, WASM-free) — the §6 "server
// bundle has 0 manifold refs" invariant must keep holding.
import { getDb } from '../db.js'
import { emitSse } from '../sse.js'
import {
  makeModelId, ModelSchema, validateOps, recomputeWarnings, generateCutlist, SETTINGS_DEFAULTS,
} from '@tenon/core'
import type { Model, OpResult, Warning, CutlistOpts, CutlistResult, CutlistSpecies } from '@tenon/core'
import { applyOps } from './applyOps.js'

// Snapshot every 25 revisions — automatic safety net (§16.2 / §9)
const SNAPSHOT_INTERVAL = 25

export function makeEmptyModel(id: string, name: string): Model {
  const now = new Date().toISOString()
  return {
    id,
    rev: 0,
    doc_version: 1,
    name,
    units: 'in',
    boards: [],
    joints: [],
    groups: [],
    meta: { notes: '', created_at: now, updated_at: now },
  }
}

export function loadModel(id: string): Model | null {
  const db = getDb()
  const row = db.prepare('SELECT doc FROM models WHERE id = ?').get(id) as { doc: string } | undefined
  if (!row) return null
  const parsed = ModelSchema.safeParse(JSON.parse(row.doc))
  // Throws rather than returning null so the caller can distinguish "not found"
  // from "exists but corrupt/unmigrated" (§16.1 migrate-on-read lands in chunk 16).
  if (!parsed.success) throw new Error(`model ${id} doc schema mismatch — needs doc migration`)
  return parsed.data
}

export interface ModelRow {
  id: string
  job_id: string | null
  name: string
  rev: number
  thumbnail: string | null
  created_at: string
  updated_at: string
}

export function createModel(name: string, jobId?: string | null): { row: ModelRow & { doc: Model } } {
  const db = getDb()
  const id = makeModelId()
  const now = new Date().toISOString()
  const model = makeEmptyModel(id, name)
  db.prepare(
    'INSERT INTO models (id, job_id, name, rev, doc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, jobId ?? null, name, 0, JSON.stringify(model), now, now)
  emitSse('model_changed', { id, event: 'created' })
  return {
    row: { id, job_id: jobId ?? null, name, rev: 0, doc: model, thumbnail: null, created_at: now, updated_at: now },
  }
}

// List models with board/joint counts (§11.2 list_models). Counts come from the
// doc — cheap at single-user scale, and always consistent with what get_model
// would return.
export function listModels(jobId?: string): Array<ModelRow & { board_count: number; joint_count: number }> {
  const db = getDb()
  const params: string[] = []
  let sql = 'SELECT id, job_id, name, rev, doc, thumbnail, created_at, updated_at FROM models'
  if (jobId) { sql += ' WHERE job_id = ?'; params.push(jobId) }
  sql += ' ORDER BY updated_at DESC'
  const rows = db.prepare(sql).all(...params) as Array<ModelRow & { doc: string }>
  return rows.map(({ doc, ...row }) => {
    let boardCount = 0
    let jointCount = 0
    try {
      const parsed = JSON.parse(doc) as { boards?: unknown[]; joints?: unknown[] }
      boardCount = parsed.boards?.length ?? 0
      jointCount = parsed.joints?.length ?? 0
    } catch { /* corrupt doc — surface zeros rather than failing the list */ }
    return { ...row, board_count: boardCount, joint_count: jointCount }
  })
}

// The §4.2 ops pipeline: validate → apply → CAS commit (rev check + name-column
// sync + periodic snapshot) → authoritative analytic lint → SSE. `ops` enters as
// unknown[] because parsing IS validation step 1 — REST and MCP feed it raw.
//
// Returns the OpResult in ALL cases plus the HTTP status the REST route should
// use; MCP callers return the OpResult body directly (ok:false is a valid,
// teaching response — §11.4). `null` means the model does not exist.
export function applyOpsCommit(
  modelId: string,
  expectedRev: number,
  ops: unknown[],
): { status: number; result: OpResult } | null {
  const db = getDb()
  const model = loadModel(modelId)
  if (!model) return null

  // Fast pre-validation rejection — avoids paying validation cost on obvious stale reads (§3.3)
  if (expectedRev !== model.rev) {
    return {
      status: 409,
      result: {
        ok: false,
        rev: model.rev,
        applied: [],
        warnings: [],
        errors: [
          `rev conflict: you sent expected_rev ${expectedRev} but the model is now at rev ${model.rev} — ` +
          `another edit landed first. Fetch the model again (get_model) for the current rev and doc, ` +
          `reapply your change on top of it, and retry with expected_rev ${model.rev}.`,
        ],
      },
    }
  }

  // Steps 1–3: schema, referential integrity, joint preconditions (core validateOps)
  const validation = validateOps(ops, model)
  if (!validation.ok) {
    return {
      status: 422,
      result: { ok: false, rev: model.rev, applied: [], warnings: [], errors: validation.errors },
    }
  }

  const { model: updated, applied } = applyOps(validation.ops, model)
  const now = new Date().toISOString()
  const newRev = updated.rev

  // CAS write — guards against a concurrent write landing between our load and this
  // transaction (the fast check above is outside the transaction, so the window exists).
  // `changes === 0` means another writer updated rev while we were validating (§3.3).
  const committed = db.transaction((): boolean => {
    // `set_model_meta` can change doc.name — keep the `models.name` column (used by list
    // queries) in sync so it doesn't drift from the doc (which the designer reads).
    const info = model.name === updated.name
      ? db.prepare('UPDATE models SET doc = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?')
          .run(JSON.stringify(updated), newRev, now, modelId, expectedRev)
      : db.prepare('UPDATE models SET doc = ?, rev = ?, name = ?, updated_at = ? WHERE id = ? AND rev = ?')
          .run(JSON.stringify(updated), newRev, updated.name, now, modelId, expectedRev)
    if (info.changes === 0) return false
    if (newRev % SNAPSHOT_INTERVAL === 0) {
      db.prepare('INSERT OR REPLACE INTO model_snapshots (model_id, rev, doc, created_at) VALUES (?, ?, ?, ?)')
        .run(modelId, newRev, JSON.stringify(updated), now)
    }
    return true
  })()

  if (!committed) {
    const current = db.prepare('SELECT rev FROM models WHERE id = ?').get(modelId) as { rev: number } | undefined
    return {
      status: 409,
      result: {
        ok: false,
        rev: current?.rev ?? model.rev,
        applied: [],
        warnings: [],
        errors: [
          `rev conflict: another write committed while this batch was validating (the model is now at ` +
          `rev ${current?.rev ?? model.rev}) — fetch the model again for the current rev and retry.`,
        ],
      },
    }
  }

  // Step 4 (§6): the analytic lint pass over the committed model is the AUTHORITY for
  // UNRESOLVED_COLLISION and JOINT_PRECONDITION_FAILED (no Manifold in Node — warnings,
  // not meshes). Both are persistent model state, re-derived here on every commit.
  const warnings: Warning[] = [...validation.warnings, ...recomputeWarnings(updated)]

  emitSse('model_changed', { id: modelId, rev: newRev })
  return { status: 200, result: { ok: true, rev: newRev, applied, warnings, errors: [] } }
}

// Build CutlistOpts from the species table + settings (with core defaults as fallback).
export function loadCutlistOpts(): CutlistOpts {
  const db = getDb()

  const species: Record<string, CutlistSpecies> = {}
  const rows = db.prepare('SELECT id, common_name, kind, cost_bf FROM species').all() as Array<{
    id: string
    common_name: string
    kind: string
    cost_bf: number
  }>
  for (const r of rows) {
    species[r.id] = { kind: r.kind === 'sheet' ? 'sheet' : 'solid', cost_bf: r.cost_bf, common_name: r.common_name }
  }

  const settings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const num = (key: string, fallback: number): number => {
    const row = settings.find((s) => s.key === key)
    if (!row) return fallback
    try {
      const v = JSON.parse(row.value) as unknown
      return typeof v === 'number' ? v : fallback
    } catch {
      return fallback
    }
  }

  return {
    species,
    wasteFactorSolid: num('waste_factor_solid', SETTINGS_DEFAULTS.waste_factor_solid),
    wasteFactorSheet: num('waste_factor_sheet', SETTINGS_DEFAULTS.waste_factor_sheet),
    fractionPrecision: num('fraction_precision', SETTINGS_DEFAULTS.fraction_precision),
  }
}

export function getCutlist(modelId: string): CutlistResult | null {
  const model = loadModel(modelId)
  if (!model) return null
  return generateCutlist(model, loadCutlistOpts())
}

// §11.2 validate_model — the lint pass without any edit (warnings only).
export function validateModel(modelId: string): { warnings: Warning[] } | null {
  const model = loadModel(modelId)
  if (!model) return null
  return { warnings: recomputeWarnings(model) }
}
