import { describe, it, expect } from 'vitest'
import { BoardSchema } from './board.js'
import {
  JointSchema,
  JOINT_TYPES,
  MortiseTenonParamsSchema,
  DovetailParamsSchema,
} from './joint.js'
import { OpSchema } from './ops.js'
import { validateOps } from './validators.js'
import { SettingsSchema, SETTINGS_DEFAULTS } from './settings.js'
import { HardwareSchema } from './hardware.js'
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
  boards: [BoardSchema.parse(BOARD_A), BoardSchema.parse(BOARD_B)],
}

const MODEL_WITH_JOINT: Model = {
  ...MODEL_WITH_BOARDS,
  joints: [
    JointSchema.parse({
      id: 'jnt_AAAAAAAAAA',
      type: 'housing',
      a: 'brd_AAAAAAAAAA',
      b: 'brd_BBBBBBBBBB',
      params: {},
    }),
  ],
}

// ── BoardSchema ───────────────────────────────────────────────────────────────

describe('BoardSchema', () => {
  it('parses a minimal valid board', () => {
    const board = BoardSchema.parse(BOARD_A)
    expect(board.id).toBe('brd_AAAAAAAAAA')
    expect(board.kind).toBe('board') // default
    expect(board.grain).toBe('x') // default
    expect(board.qty).toBe(1) // default
    expect(board.locked).toBe(false) // default
    expect(board.glue_up).toBeNull() // default
    expect(board.edge_grooves).toEqual([]) // default
  })

  it('accepts panel with glue_up', () => {
    const board = BoardSchema.parse({
      ...BOARD_A,
      kind: 'panel',
      glue_up: { strips: 3 },
    })
    expect(board.kind).toBe('panel')
    expect(board.glue_up?.max_strip_width).toBe(5.5) // default
    expect(board.glue_up?.strips).toBe(3)
  })

  it('accepts edge_grooves and fills defaults', () => {
    const board = BoardSchema.parse({
      ...BOARD_A,
      edge_grooves: [{ id: 'egv_AAAAAAAAAA', edge: 'bottom', depth: 0.375 }],
    })
    expect(board.edge_grooves).toHaveLength(1)
    expect(board.edge_grooves[0].width).toBe(0.25) // default: 1/4" slot cutter
    expect(board.edge_grooves[0].offset).toBe(0) // default
    expect(board.edge_grooves[0].stopped).toBe(false) // default
  })

  it('rejects missing dims', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, dims: undefined }).success).toBe(false)
  })

  it('rejects non-positive dims', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, dims: { l: -1, w: 2, t: 0.75 } }).success).toBe(false)
  })

  it('rejects invalid kind', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, kind: 'timber' }).success).toBe(false)
  })

  it('rejects a board id without the brd_ prefix', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, id: 'box_AAAAAAAAAA' }).success).toBe(false)
  })

  it('rejects a species id without the spc_ prefix', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, species: 'red_oak' }).success).toBe(false)
  })

  it('rejects unknown keys (strict)', () => {
    expect(BoardSchema.safeParse({ ...BOARD_A, thickness: 1 }).success).toBe(false)
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
    expect(joint.enabled).toBe(true) // default
    if (joint.type === 'mortise_tenon') {
      expect(joint.params.thickness_fraction).toBeCloseTo(1 / 3) // default
      expect(joint.params.width_shoulders).toEqual([0.375, 0.375]) // default
      expect(joint.params.haunch).toBe('none') // default
      expect(joint.params.wedged).toBe(false) // default
      expect(joint.params.twin).toBe(false) // default
    }
  })

  it('parses a housing joint', () => {
    const joint = JointSchema.parse({
      id: 'jnt_BBBBBBBBBB',
      type: 'housing',
      a: 'brd_side',
      b: 'brd_shelf',
      params: { stopped: true },
    })
    expect(joint.type).toBe('housing')
    if (joint.type === 'housing') {
      expect(joint.params.stopped).toBe(true)
      expect(joint.params.stop_offset).toBe(0.75) // default 3/4"
      expect(joint.params.fit_allowance).toBe(0) // default
    }
  })

  it('parses each joint type', () => {
    for (const type of JOINT_TYPES) {
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

  it('rejects unknown param keys (strict)', () => {
    const result = JointSchema.safeParse({
      id: 'jnt_AAAAAAAAAA',
      type: 'mortise_tenon',
      a: 'brd_A',
      b: 'brd_B',
      params: { wedge: true }, // typo for 'wedged' — must not be silently dropped
    })
    expect(result.success).toBe(false)
  })

  it('rejects thickness_fraction outside (0, 1)', () => {
    expect(MortiseTenonParamsSchema.safeParse({ thickness_fraction: 1.5 }).success).toBe(false)
    expect(MortiseTenonParamsSchema.safeParse({ thickness_fraction: 0 }).success).toBe(false)
  })

  it('validates dovetail slope format', () => {
    expect(DovetailParamsSchema.safeParse({ slope: '1:6' }).success).toBe(true)
    expect(DovetailParamsSchema.safeParse({ slope: 'steep' }).success).toBe(false)
  })
})

// ── OpSchema ──────────────────────────────────────────────────────────────────

describe('OpSchema', () => {
  it('parses add_board', () => {
    const op = OpSchema.parse({
      op: 'add_board',
      board: {
        name: 'leg',
        dims: { l: 30, w: 1.75, t: 1.75 },
        species: 'spc_red_oak',
        transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
      },
    })
    expect(op.op).toBe('add_board')
  })

  it('add_board: id is optional', () => {
    const result = OpSchema.safeParse({
      op: 'add_board',
      board: {
        name: 'test',
        dims: { l: 10, w: 2, t: 1 },
        species: 'spc_oak',
        transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
      },
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
    expect(OpSchema.safeParse({ op: 'explode_board', id: 'brd_X' }).success).toBe(false)
  })

  it('rejects unknown keys on an op (strict)', () => {
    expect(OpSchema.safeParse({ op: 'remove_board', id: 'brd_X', force: true }).success).toBe(false)
  })

  it('rejects joint board refs without the brd_ prefix', () => {
    const result = OpSchema.safeParse({
      op: 'add_joint',
      joint: { type: 'butt', a: 'jnt_AAAAAAAAAA', b: 'brd_B', params: {} },
    })
    expect(result.success).toBe(false)
  })
})

// ── validateOps — basics ──────────────────────────────────────────────────────

describe('validateOps', () => {
  it('passes a valid add_board op', () => {
    const ops = [
      {
        op: 'add_board',
        board: {
          name: 'leg',
          dims: { l: 30, w: 1.75, t: 1.75 },
          species: 'spc_red_oak',
          transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
        },
      },
    ]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns parsed ops with defaults filled', () => {
    const ops = [
      {
        op: 'add_board',
        board: {
          name: 'leg',
          dims: { l: 30, w: 1.75, t: 1.75 },
          species: 'spc_red_oak',
          transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
        },
      },
    ]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ops).toHaveLength(1)
    const op = result.ops[0]
    if (op.op === 'add_board') {
      expect(op.board.kind).toBe('board')
      expect(op.board.qty).toBe(1)
    }
  })

  it('rejects malformed op (schema validation)', () => {
    const result = validateOps([{ op: 'update_board', id: 123 }], EMPTY_MODEL)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('collects schema errors from every malformed op, with indices', () => {
    const result = validateOps(
      [{ op: 'remove_board' }, { op: 'ungroup' }],
      EMPTY_MODEL,
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.startsWith('ops[0]'))).toBe(true)
    expect(result.errors.some(e => e.startsWith('ops[1]'))).toBe(true)
  })

  it('rejects update_board when board does not exist', () => {
    const ops = [{ op: 'update_board', id: 'brd_XXXXXXXXXX', patch: { name: 'new' } }]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('rejects add_joint when a === b', () => {
    const ops = [
      {
        op: 'add_joint',
        joint: { type: 'half_lap', a: 'brd_AAAAAAAAAA', b: 'brd_AAAAAAAAAA', params: {} },
      },
    ]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/different boards/)
  })

  it('rejects add_joint when board id does not exist', () => {
    const ops = [
      {
        op: 'add_joint',
        joint: { type: 'butt', a: 'brd_AAAAAAAAAA', b: 'brd_ZZZZZZZZZZ', params: {} },
      },
    ]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('passes valid add_joint between existing boards', () => {
    const ops = [
      {
        op: 'add_joint',
        joint: { type: 'mortise_tenon', a: 'brd_AAAAAAAAAA', b: 'brd_BBBBBBBBBB', params: {} },
      },
    ]
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
    const ops = [{ op: 'group', member_ids: ['brd_AAAAAAAAAA', 'brd_ZZZZZZZZZZ'] }]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('rejects ungroup with non-existent group', () => {
    const result = validateOps([{ op: 'ungroup', group_id: 'grp_ZZZZZZZZZZ' }], EMPTY_MODEL)
    expect(result.ok).toBe(false)
  })

  it('reports the failing op index and op name', () => {
    const ops = [
      { op: 'set_model_meta', patch: { name: 'renamed' } },
      { op: 'remove_board', id: 'brd_ZZZZZZZZZZ' },
    ]
    const result = validateOps(ops, EMPTY_MODEL)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/^ops\[1\] \(remove_board\)/)
  })
})

// ── validateOps — batch sequencing ────────────────────────────────────────────

describe('validateOps — batch sequencing', () => {
  it('allows a batch that adds a board and joints it in the same call', () => {
    const ops = [
      {
        op: 'add_board',
        board: {
          id: 'brd_CCCCCCCCCC',
          name: 'shelf',
          dims: { l: 24, w: 10, t: 0.75 },
          species: 'spc_red_oak',
          transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
        },
      },
      {
        op: 'add_joint',
        joint: { type: 'housing', a: 'brd_AAAAAAAAAA', b: 'brd_CCCCCCCCCC', params: {} },
      },
    ]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(true)
  })

  it('rejects add_board with an id that already exists', () => {
    const ops = [
      {
        op: 'add_board',
        board: {
          id: 'brd_AAAAAAAAAA',
          name: 'dup',
          dims: { l: 1, w: 1, t: 1 },
          species: 'spc_red_oak',
          transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
        },
      },
    ]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/already exists/)
  })

  it('rejects ops referencing a board removed earlier in the batch', () => {
    const ops = [
      { op: 'remove_board', id: 'brd_AAAAAAAAAA' },
      { op: 'transform_board', id: 'brd_AAAAAAAAAA', pos: [1, 0, 0] },
    ]
    const result = validateOps(ops, MODEL_WITH_BOARDS)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/^ops\[1\]/)
    expect(result.errors[0]).toMatch(/does not exist/)
  })

  it('cascades joint removal when a referenced board is removed', () => {
    const ops = [
      { op: 'remove_board', id: 'brd_AAAAAAAAAA' },
      { op: 'update_joint', id: 'jnt_AAAAAAAAAA', patch: { enabled: false } },
    ]
    const result = validateOps(ops, MODEL_WITH_JOINT)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/joint 'jnt_AAAAAAAAAA' does not exist/)
  })
})

// ── validateOps — per-type joint param patches ───────────────────────────────

describe('validateOps — update_joint param checking', () => {
  it('accepts a valid param patch for the joint type', () => {
    const ops = [
      { op: 'update_joint', id: 'jnt_AAAAAAAAAA', patch: { params: { stopped: true } } },
    ]
    const result = validateOps(ops, MODEL_WITH_JOINT)
    expect(result.ok).toBe(true)
  })

  it('rejects a param patch with invalid values', () => {
    const ops = [
      { op: 'update_joint', id: 'jnt_AAAAAAAAAA', patch: { params: { depth: -1 } } },
    ]
    const result = validateOps(ops, MODEL_WITH_JOINT)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/depth/)
    expect(result.errors[0]).toMatch(/housing/) // names the joint type — errors must teach
  })

  it('rejects unknown param keys', () => {
    const ops = [
      { op: 'update_joint', id: 'jnt_AAAAAAAAAA', patch: { params: { bananas: 1 } } },
    ]
    const result = validateOps(ops, MODEL_WITH_JOINT)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/[Uu]nrecognized key/)
  })
})

// ── Settings / Hardware ───────────────────────────────────────────────────────

describe('SettingsSchema', () => {
  it('parses the seed defaults', () => {
    expect(SettingsSchema.parse(SETTINGS_DEFAULTS)).toEqual(SETTINGS_DEFAULTS)
  })

  it('rejects density values outside comfortable|shop', () => {
    expect(SettingsSchema.safeParse({ ...SETTINGS_DEFAULTS, density: 'compact' }).success).toBe(false)
  })
})

describe('HardwareSchema', () => {
  it('round-trips DB nulls and fills defaults', () => {
    const hw = HardwareSchema.parse({
      id: 'hdw_AAAAAAAAAA',
      job_id: null,
      model_id: null,
      item: '3/8 brass knobs',
      supplier: null,
      notes: null,
    })
    expect(hw.qty).toBe(1)
    expect(hw.unit).toBe('ea')
    expect(hw.unit_cost).toBeNull()
  })
})
