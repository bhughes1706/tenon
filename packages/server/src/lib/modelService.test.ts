import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDb, getDb } from '../db.js'
import {
  applyOpsCommit, createModel, deleteModel, getCutlist, listModels, loadModel, updateModelMeta,
  validateModel,
} from './modelService.js'

// Integration tests over a real temp-dir SQLite (migrations included) — this is
// the ONE §4.2 pipeline both the REST routes and the MCP model tools sit on.

const BOARD_A = {
  id: 'brd_AAAAAAAAAA',
  name: 'stile',
  dims: { l: 30, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
}
// Overlaps A (x∈[11,15] ∩ [-15,15]) so joints between them pass preconditions.
const BOARD_B = {
  id: 'brd_BBBBBBBBBB',
  name: 'rail',
  dims: { l: 18, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [20, 0, 0], rot: [0, 0, 0] },
}

beforeAll(() => {
  openDb(fs.mkdtempSync(path.join(os.tmpdir(), 'tenon-modelservice-')))
})

describe('createModel / loadModel / listModels', () => {
  it('creates an empty model at rev 0 and lists it with zero counts', () => {
    const { row } = createModel('Test Bench')
    expect(row.rev).toBe(0)
    expect(loadModel(row.id)?.name).toBe('Test Bench')
    const listed = listModels().find((m) => m.id === row.id)!
    expect(listed.board_count).toBe(0)
    expect(listed.joint_count).toBe(0)
  })

  it('loadModel returns null for an unknown id', () => {
    expect(loadModel('mdl_ZZZZZZZZZZ')).toBeNull()
  })
})

describe('applyOpsCommit — the §4.2 pipeline', () => {
  it('applies a valid batch, bumps rev, and returns authoritative warnings', () => {
    const { row } = createModel('Ops Test')
    const outcome = applyOpsCommit(row.id, 0, [
      { op: 'add_board', board: BOARD_A },
      { op: 'add_board', board: BOARD_B },
    ])!
    expect(outcome.status).toBe(200)
    expect(outcome.result.ok).toBe(true)
    expect(outcome.result.rev).toBe(1)
    // A and B genuinely overlap with no joint → the persistent collision lint.
    expect(outcome.result.warnings.map((w) => w.code)).toContain('UNRESOLVED_COLLISION')
    expect(loadModel(row.id)?.boards).toHaveLength(2)
  })

  it('rejects a stale expected_rev with 409 and the current rev', () => {
    const { row } = createModel('Rev Conflict')
    applyOpsCommit(row.id, 0, [{ op: 'add_board', board: BOARD_A }])
    const outcome = applyOpsCommit(row.id, 0, [{ op: 'add_board', board: BOARD_B }])!
    expect(outcome.status).toBe(409)
    expect(outcome.result.ok).toBe(false)
    expect(outcome.result.rev).toBe(1)
    expect(outcome.result.errors[0]).toMatch(/rev conflict/)
  })

  it('rejects an invalid batch with 422 and a teaching per-op error', () => {
    const { row } = createModel('Validation')
    const outcome = applyOpsCommit(row.id, 0, [
      { op: 'update_board', id: 'brd_XXXXXXXXXX', patch: { name: 'nope' } },
    ])!
    expect(outcome.status).toBe(422)
    expect(outcome.result.ok).toBe(false)
    expect(outcome.result.errors[0]).toMatch(/does not exist/)
    expect(loadModel(row.id)?.rev).toBe(0) // nothing committed
  })

  it('returns null for an unknown model', () => {
    expect(applyOpsCommit('mdl_ZZZZZZZZZZ', 0, [{ op: 'set_model_meta', patch: {} }])).toBeNull()
  })

  it('keeps the name column in sync when set_model_meta renames the doc', () => {
    const { row } = createModel('Old Name')
    const outcome = applyOpsCommit(row.id, 0, [{ op: 'set_model_meta', patch: { name: 'New Name' } }])!
    expect(outcome.result.ok).toBe(true)
    const col = getDb().prepare('SELECT name FROM models WHERE id = ?').get(row.id) as { name: string }
    expect(col.name).toBe('New Name')
    expect(loadModel(row.id)?.name).toBe('New Name')
  })

  it('adding a joint between the colliding pair clears the collision lint', () => {
    const { row } = createModel('Joint Resolve')
    applyOpsCommit(row.id, 0, [
      { op: 'add_board', board: BOARD_A },
      { op: 'add_board', board: BOARD_B },
    ])
    expect(validateModel(row.id)!.warnings.map((w) => w.code)).toContain('UNRESOLVED_COLLISION')
    const outcome = applyOpsCommit(row.id, 1, [
      {
        op: 'add_joint',
        joint: { id: 'jnt_AAAAAAAAAA', type: 'mortise_tenon', a: BOARD_A.id, b: BOARD_B.id, params: {} },
      },
    ])!
    expect(outcome.result.ok).toBe(true)
    expect(outcome.result.warnings.map((w) => w.code)).not.toContain('UNRESOLVED_COLLISION')
    expect(validateModel(row.id)!.warnings).toHaveLength(0)
  })

  it('writes a snapshot every 25 revisions', () => {
    const { row } = createModel('Snapshots')
    applyOpsCommit(row.id, 0, [{ op: 'add_board', board: BOARD_A }])
    for (let rev = 1; rev < 25; rev++) {
      const out = applyOpsCommit(row.id, rev, [
        { op: 'transform_board', id: BOARD_A.id, pos: [rev % 2, 0, 0] },
      ])!
      expect(out.result.ok).toBe(true)
    }
    const snap = getDb()
      .prepare('SELECT rev FROM model_snapshots WHERE model_id = ?')
      .all(row.id) as { rev: number }[]
    expect(snap.map((s) => s.rev)).toEqual([25])
  })
})

describe('updateModelMeta', () => {
  const makeJob = (id: string) => {
    getDb().prepare("INSERT INTO jobs (id, title, status) VALUES (?, 'Test Job', 'lead')").run(id)
    return id
  }

  it('assigns a job, then explicit null clears it while absent leaves it untouched', () => {
    const jobId = makeJob('job_AAAAAAAAAA')
    const { row } = createModel('Standalone')
    expect(row.job_id).toBeNull()

    const assigned = updateModelMeta(row.id, { job_id: jobId })
    expect(assigned).toEqual({ ok: true, row: expect.objectContaining({ job_id: jobId }) })

    const renamedOnly = updateModelMeta(row.id, { name: 'Renamed' })
    expect(renamedOnly.ok).toBe(true)
    expect((renamedOnly as { ok: true; row: { job_id: string | null } }).row.job_id).toBe(jobId)
    expect(loadModel(row.id)?.name).toBe('Renamed')

    const cleared = updateModelMeta(row.id, { job_id: null })
    expect(cleared.ok).toBe(true)
    expect((cleared as { ok: true; row: { job_id: string | null } }).row.job_id).toBeNull()
  })

  it('rejects an unknown job_id', () => {
    const { row } = createModel('Bad Job')
    expect(updateModelMeta(row.id, { job_id: 'job_ZZZZZZZZZZ' })).toEqual({ ok: false, reason: 'unknown_job' })
  })

  it('returns not_found for an unknown model', () => {
    expect(updateModelMeta('mdl_ZZZZZZZZZZ', { name: 'x' })).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('deleteModel', () => {
  it('deletes the model, its snapshots, and detaches (does not delete) hardware', () => {
    const { row } = createModel('To Delete')
    applyOpsCommit(row.id, 0, [{ op: 'add_board', board: BOARD_A }])
    getDb().prepare('INSERT OR REPLACE INTO model_snapshots (model_id, rev, doc, created_at) VALUES (?, 1, ?, ?)')
      .run(row.id, JSON.stringify(loadModel(row.id)), new Date().toISOString())
    getDb().prepare("INSERT INTO jobs (id, title, status) VALUES ('job_HHHHHHHHHH', 'Hardware Job', 'lead')").run()
    getDb().prepare(
      "INSERT INTO hardware (id, job_id, model_id, item, qty) VALUES ('hw_AAAAAAAAAA', 'job_HHHHHHHHHH', ?, 'hinge', 2)"
    ).run(row.id)

    expect(deleteModel(row.id)).toBe(true)
    expect(loadModel(row.id)).toBeNull()
    expect(getDb().prepare('SELECT * FROM model_snapshots WHERE model_id = ?').all(row.id)).toHaveLength(0)
    const hw = getDb().prepare('SELECT model_id FROM hardware WHERE id = ?').get('hw_AAAAAAAAAA') as { model_id: string | null }
    expect(hw.model_id).toBeNull()
  })

  it('returns false for an unknown model', () => {
    expect(deleteModel('mdl_ZZZZZZZZZZ')).toBe(false)
  })
})

describe('getCutlist / validateModel', () => {
  it('produces cut-list rows for a model with boards', () => {
    const { row } = createModel('Cutlist')
    applyOpsCommit(row.id, 0, [{ op: 'add_board', board: BOARD_A }])
    const result = getCutlist(row.id)!
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].finished.l).toBe(30)
  })

  it('returns null for unknown models', () => {
    expect(getCutlist('mdl_ZZZZZZZZZZ')).toBeNull()
    expect(validateModel('mdl_ZZZZZZZZZZ')).toBeNull()
  })
})
