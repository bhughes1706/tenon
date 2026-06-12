import { describe, it, expect } from 'vitest'
import { BoardSchema } from './board.js'
import { JointSchema } from './joint.js'
import { OpSchema } from './ops.js'
import { validateOps } from './validators.js'
import type { Model } from './model.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BOARD_A = {
  id: 'brd_AAAAAAAAAA',
  name: 'stile',
  dims: { l: 30, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
}

const BOARD_B = {
  id: 'brd_BBBBBBBBBB',
  name: 'rail',
  dims: { l: 18, w: 2.5, t: 0.75 },
  species: 'spc_red_oak',
  transform: { pos: [0, 15, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
}

const EMPTY_MODEL: Model = {
  id: 'mdl_AAAAAAAAAA',
  rev: 0,
  doc_version: 1,
  name: 'test',
  units: 'in',
  boards: [],
  joints: [],
  groups: [],
  meta: { notes: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
}

const MODEL_WITH_BOARDS: Model = {
  ...EMPTY_MODEL,
  boards: [
    BoardSchema.parse(BOARD_A),
    BoardSchema.parse(BOARD_B),
  ],
}

// ── BoardSchema ───────────────────────────────────────────────────────────────

describe('BoardSchema', () => {
  it('parses a minimal valid board', () => {
    const board = BoardSchema.parse(BOARD_A)
    expect(board.id).toBe('brd_AAAAAAAAAA')
    expect(board.kind).toBe('board')     // default
    expect(board.grain).toBe('x')        // default
    expect(board.qty).toBe(1)            // default
    expect(board.locked).toBe(false)     // default
    expect(board.glue_up).toBeNull()     // default
    expect(board.edge_grooves).toEqual([]) // default
  })

  it('accepts panel with glue_up', () => {
    const board = BoardSchema.parse({
      ...BOARD_A,
      kind: 'panel',
      glue_up: { strips: 3 },
    })
    expect(board.kind).toBe('panel')
    expect(board.glue_up?.max_strip_width).toBe(5.5)  // default
    expect(board.glue_up?.strips).toBe(3)
  })

  it('accepts edge_grooves', () => {
    const board = BoardSchema.parse({
      ...BOARD_A,
      edge_grooves: [{
        id: 'egv_AAAAAAAAAA',
        edge: 'bottom',
        depth: 0.375,
        width: 0.25,
      }],
    })
    expect(board.edge_grooves).toHaveLength(1)
    expect(board.edge_grooves[0].offset).toBe(0)      // default
    expect(board.edge_grooves[0].stopped).toBe(false)  // default
  })

  it('rejects missing dims', () => {
    const result = BoardSchema.safeParse({ ...BOARD_A, dims: undefined })
    expect(result.success).toBe(false)
  })

  it('rejects non-positive dims', () => {
    const result = BoardSchema.safeParse({ ...BOARD_A, dims: { l: -1, w: 2, t: 0.75 } })
    expect(result.success).toBe(false)
  })

  it('rejects invalid kind', () => {
    const result = BoardSchema.safeParse({ ...BOARD_A, kind: 'timber' })
    expect(result.success).toBe(false)
  })
})

// ── JointSchema ───────────────────────────────────────────────────────────────

describe('JointSchema', () => {
  it('parses a mortise_tenon joint with defaults', () => {
    const joint = JointSchema.parse({
      id: 'jnt_AAAAAAAAAA',
      type: 'mortise_tenon',
      a: 'brd_stile',
      b: 'brd_rail',
      params: {},
    })
    expect(joint.type).toBe('mortise_tenon')
    expect(joint.enabled).toBe(true)            // default
    if (joint.type === 'mortise_tenon') {
      expect(joint.params.haunch).toBe('none')  // default
      expect(joint.params.wedged).toBe(false)   // default
      expect(joint.params.twin).toBe(false)     // default
    }
  })

  it('parses a housing joint', () => {
    const joint = JointSchema.parse({
      id: 'jnt_BBBBBBBBBB',
      type: 'housing',
      a: 'brd_side',
      b: 'brd_shelf',
      params: { stopped: true, stop_offset: 0.75 },
    })
    expect(joint.type).toBe('housing')
    if (joint.type === 'housing') {
      expect(joint.params.stopped).toBe(true)
      expect(joint.params.fit_allowance).toBe(0)  // default
    }
  })

  it('parses each joint type', () => {
    const types = ['butt', 'rabbet', 'housing', 'half_lap', 'bridle',
                   'mortise_tenon', 'box_joint', 'dovetail', 'miter'] as const
    for (const type of types) {
      const result = JointSchema.safeParse({
        id: 'jnt_AAAAAAAAAA',
        type,
        a: 'brd_A',
        b: 'brd_B',
        params: {},
      })
      expect(result.success, `joint type '${type}' should parse`).toBe(true)
    }
  })

  it('rejects unknown joint type', () => {
    const result = JointSchema.safeParse({
      id: 'jnt_AAAAAAAAAA',
      type: 'dovetail_sliding',
      a: 'brd_A',
      b: 'brd_B',
      params: {},
    })
    expect(result.success).toBe(false)
  })
})

// ── OpSchema ──────────────────────────────────────────────────────────────────

describe('OpSchema', () => {
  it('parses add_board', () => {
    const op = OpSchema.parse({
      op: 'add_board',
      board: { name: 'leg', dims: { l: 30, w: 1.75, t: 1.75 }, species: 'spc_red_oak',
               transform: { pos: [0, 0, 0], rot: [0, 0, 0] } },
    })
    expect(op.op).toBe('add_board')
  })

  it('add_board: id is optional', () => {
    const result = OpSchema.safeParse({
      op: 'add_board',
      board: { dims: { l: 10, w: 2, t: 1 }, species: 'spc_oak', name: 'test',
               transform: { pos: [0, 0, 0], rot: [0, 0, 0] } },
    })
    expect(result.success).toBe(true)
  })

  it('parses transform_board', () => {
    const op = OpSchema.parse({ op: 'transform_board', id: 'brd_X', pos: [1, 2, 3] })
    expect(op.op).toBe('transform_board')
  })

  it('parses add_joint', () => {
    const op = OpSchema.parse({
      op: 'add_joint',
      joint: { type: 'half_lap', a: 'brd_A', b: 'brd_B', params: {} },
    })
    expect(op.op).toBe('add_joint')
  })

  it('parses group/ungroup', () => {
    const g = OpSchema.parse({ op: 'group', member_ids: ['brd_A', 'brd_B'] })
    const u = OpSchema.parse({ op: 'ungroup', group_id: 'grp_X' })
    expect(g.op).toBe('group')
    expect(u.op).toBe('ungroup')
  })

  it('rejects unknown op', () => {
    const result = OpSchema.safeParse({ op: 'explode_board', id: 'brd_X' })
    expect(result.success).toBe(false)
  })
})

// ── validateOps ───────────────────────────────────────────────────────────────

describe('validateOps', () => {
  it('passes a valid add_board op', () => {
    const ops = [{
      op: 'add_board',
      board: { name: 'leg', dims: { l: 30, w: 1.75, t: 1.75 }, species: 'spc_red_oak',
               transform: { pos: [0, 0, 0], rot: [0, 0, 0] } },
    }]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects malformed op (schema validation)', () => {
    const result = validateOps([{ op: 'update_board', id: 123 }], EMPTY_MODEL)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects update_board when board does not exist', () => {
    const ops = [{ op: 'update_board', id: 'brd_XXXXXXXXXX', patch: { name: 'new' } }]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('rejects add_joint when a === b', () => {
    const ops = [{
      op: 'add_joint',
      joint: { type: 'half_lap', a: 'brd_AAAAAAAAAA', b: 'brd_AAAAAAAAAA', params: {} },
    }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/different boards/)
  })

  it('rejects add_joint when board id does not exist', () => {
    const ops = [{
      op: 'add_joint',
      joint: { type: 'butt', a: 'brd_AAAAAAAAAA', b: 'brd_ZZZZZZZZZZ', params: {} },
    }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('passes valid add_joint between existing boards', () => {
    const ops = [{
      op: 'add_joint',
      joint: { type: 'mortise_tenon', a: 'brd_AAAAAAAAAA', b: 'brd_BBBBBBBBBB', params: {} },
    }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(true)
  })

  it('rejects transform_board with neither pos nor rot', () => {
    const ops = [{ op: 'transform_board', id: 'brd_AAAAAAAAAA' }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/pos or rot/)
  })

  it('rejects group with non-existent member', () => {
    const ops = [{
      op: 'group',
      member_ids: ['brd_AAAAAAAAAA', 'brd_ZZZZZZZZZZ'],
    }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('rejects ungroup with non-existent group', () => {
    const ops = [{ op: 'ungroup', group_id: 'grp_ZZZZZZZZZZ' }]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(false)
  })
})
