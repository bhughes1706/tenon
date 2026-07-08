import { describe, it, expect } from 'vitest'
import type { Board, Joint, Model, Op } from '@tenon/core'
import { applyOpsLocal, invertOps } from './clientOps.js'

function board(id: string, over: Partial<Board> = {}): Board {
  return {
    id,
    name: id,
    kind: 'board',
    dims: { l: 24, w: 3, t: 0.75 },
    species: 'spc_red_oak',
    grain: 'x',
    transform: { pos: [0, 0, 0], rot: [0, 0, 0] },
    qty: 1,
    tags: [],
    locked: false,
    glue_up: null,
    edge_grooves: [],
    edge_profiles: [],
    panel_fit: null,
    ...over,
  }
}

function model(boards: Board[], joints: Joint[] = []): Model {
  const now = '2026-06-13T00:00:00.000Z'
  return {
    id: 'mdl_test',
    rev: 5,
    doc_version: 1,
    name: 'Test',
    units: 'in',
    boards,
    joints,
    groups: [],
    meta: { notes: '', created_at: now, updated_at: now },
  }
}

// Compare the geometric content (id-keyed), ignoring rev / timestamps and array order.
function norm(m: Model) {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
  return { boards: byId(m.boards), joints: byId(m.joints), groups: byId(m.groups) }
}

function roundTrip(start: Model, ops: Op[]) {
  const after = applyOpsLocal(start, ops)
  const inverse = invertOps(ops, start)
  const restored = applyOpsLocal(after, inverse)
  return { after, inverse, restored }
}

describe('applyOpsLocal', () => {
  it('bumps rev and refreshes updated_at', () => {
    const m = applyOpsLocal(model([board('brd_a')]), [{ op: 'transform_board', id: 'brd_a', pos: [1, 2, 3] }])
    expect(m.rev).toBe(6)
    expect(m.boards[0].transform.pos).toEqual([1, 2, 3])
  })

  it('cascades joint removal when a referenced board is removed', () => {
    const j: Joint = { id: 'jnt_1', type: 'butt', a: 'brd_a', b: 'brd_b', enabled: true, params: { fastener: 'none', dia: 0.375 } }
    const m = applyOpsLocal(model([board('brd_a'), board('brd_b')], [j]), [{ op: 'remove_board', id: 'brd_a' }])
    expect(m.boards.map((b) => b.id)).toEqual(['brd_b'])
    expect(m.joints).toHaveLength(0)
  })
})

describe('invertOps round-trips', () => {
  it('add_board ↔ remove_board', () => {
    const start = model([board('brd_a')])
    const { restored } = roundTrip(start, [{ op: 'add_board', board: board('brd_new') }])
    expect(norm(restored)).toEqual(norm(start))
  })

  it('transform_board restores prior pose', () => {
    const start = model([board('brd_a', { transform: { pos: [1, 1, 1], rot: [0, 90, 0] } })])
    const { restored } = roundTrip(start, [{ op: 'transform_board', id: 'brd_a', pos: [5, 6, 7], rot: [0, 0, 45] }])
    expect(norm(restored)).toEqual(norm(start))
  })

  it('update_board restores patched fields', () => {
    const start = model([board('brd_a', { dims: { l: 24, w: 3, t: 0.75 }, species: 'spc_red_oak' })])
    const { restored } = roundTrip(start, [
      { op: 'update_board', id: 'brd_a', patch: { dims: { l: 30, w: 4, t: 1 }, species: 'spc_walnut' } } as unknown as Op,
    ])
    expect(norm(restored)).toEqual(norm(start))
  })

  it('remove_board restores the board and its cascaded joints', () => {
    const j: Joint = { id: 'jnt_1', type: 'butt', a: 'brd_a', b: 'brd_b', enabled: true, params: { fastener: 'none', dia: 0.375 } }
    const start = model([board('brd_a'), board('brd_b')], [j])
    const { restored } = roundTrip(start, [{ op: 'remove_board', id: 'brd_a' }])
    expect(norm(restored)).toEqual(norm(start))
  })

  it('chains multi-op batches in reverse', () => {
    const start = model([board('brd_a')])
    const { restored } = roundTrip(start, [
      { op: 'add_board', board: board('brd_b') },
      { op: 'transform_board', id: 'brd_b', pos: [2, 0, 0] },
    ])
    expect(norm(restored)).toEqual(norm(start))
  })

  it('declines to invert duplicate_board (server-assigned id)', () => {
    const start = model([board('brd_a')])
    expect(invertOps([{ op: 'duplicate_board', id: 'brd_a', offset: [1, 0, 0] }], start)).toEqual([])
  })

  // Chunk 8: duplicateSelected emits add_board with an explicit id (not the
  // non-invertible duplicate_board op) so the copy is undoable.
  it('duplicate-as-add_board with explicit id round-trips', () => {
    const start = model([board('brd_a')])
    const copy = board('brd_copy', { name: 'left front leg copy', transform: { pos: [2, 0, 2], rot: [0, 0, 0] } })
    const { after, restored } = roundTrip(start, [{ op: 'add_board', board: copy }])
    expect(after.boards.map((b) => b.id)).toEqual(['brd_a', 'brd_copy'])
    expect(norm(restored)).toEqual(norm(start))
  })

  // Chunk 8: groupSelected supplies an explicit grp_ id so group is invertible.
  it('group ↔ ungroup round-trips when the group id is explicit', () => {
    const start = model([board('brd_a'), board('brd_b')])
    const { after, restored } = roundTrip(start, [
      { op: 'group', member_ids: ['brd_a', 'brd_b'], id: 'grp_test01' },
    ])
    expect(after.groups).toHaveLength(1)
    expect(after.groups[0].members).toEqual(['brd_a', 'brd_b'])
    expect(norm(restored)).toEqual(norm(start))
  })
})
