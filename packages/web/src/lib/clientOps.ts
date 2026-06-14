import type { Op, Model, Board, Joint, Group } from '@tenon/core'
import { makeBoardId, makeJointId, makeGroupId } from '@tenon/core'

// Client-side twin of the server's applyOps (packages/server/src/lib/applyOps.ts).
// The viewport applies ops optimistically so edits feel instant; the server stays
// authoritative — every dispatch posts the same ops and the store reconciles on
// the returned rev (§3.3, §4). Keep this in lock-step with the server applier.
//
// The UI supplies explicit ids on every add (via core's id generators) so an
// optimistic id never disagrees with the server's, which also makes undo/redo
// deterministic — no temp-id reconciliation.

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// Mutates `m` in place for one op. Mirrors server applyOps semantics.
function applyOne(m: Model, op: Op): void {
  switch (op.op) {
    case 'add_board': {
      const id = op.board.id ?? makeBoardId()
      m.boards.push({ ...op.board, id } as Board)
      break
    }
    case 'update_board': {
      const idx = m.boards.findIndex((b) => b.id === op.id)
      if (idx !== -1) m.boards[idx] = { ...m.boards[idx], ...op.patch } as Board
      break
    }
    case 'transform_board': {
      const idx = m.boards.findIndex((b) => b.id === op.id)
      if (idx !== -1) {
        const board = m.boards[idx]
        m.boards[idx] = {
          ...board,
          transform: {
            pos: op.pos ?? board.transform.pos,
            rot: op.rot ?? board.transform.rot,
          },
        }
      }
      break
    }
    case 'duplicate_board': {
      const src = m.boards.find((b) => b.id === op.id)
      if (!src) break
      const pos: [number, number, number] = [
        src.transform.pos[0] + op.offset[0],
        src.transform.pos[1] + op.offset[1],
        src.transform.pos[2] + op.offset[2],
      ]
      if (op.mirror) {
        const axis = ['x', 'y', 'z'].indexOf(op.mirror) as 0 | 1 | 2
        pos[axis] = src.transform.pos[axis] - op.offset[axis]
      }
      m.boards.push({ ...clone(src), id: makeBoardId(), transform: { pos, rot: src.transform.rot } })
      break
    }
    case 'remove_board': {
      m.boards = m.boards.filter((b) => b.id !== op.id)
      m.joints = m.joints.filter((j) => j.a !== op.id && j.b !== op.id)
      break
    }
    case 'add_joint': {
      const id = op.joint.id ?? makeJointId()
      m.joints.push({ ...op.joint, id } as Joint)
      break
    }
    case 'update_joint': {
      const idx = m.joints.findIndex((j) => j.id === op.id)
      if (idx !== -1) {
        const joint = m.joints[idx] as Joint & { params: Record<string, unknown> }
        m.joints[idx] = {
          ...joint,
          ...(op.patch.enabled !== undefined ? { enabled: op.patch.enabled } : {}),
          ...(op.patch.params !== undefined
            ? { params: { ...joint.params, ...op.patch.params } }
            : {}),
        } as Joint
      }
      break
    }
    case 'remove_joint': {
      m.joints = m.joints.filter((j) => j.id !== op.id)
      break
    }
    case 'group': {
      const group: Group = { id: op.id ?? makeGroupId(), name: op.name ?? '', members: op.member_ids }
      m.groups.push(group)
      break
    }
    case 'ungroup': {
      m.groups = m.groups.filter((g) => g.id !== op.group_id)
      break
    }
    case 'set_model_meta': {
      m.meta = { ...m.meta, ...op.patch }
      break
    }
  }
}

// Apply a validated op batch optimistically, returning a new model with rev bumped.
export function applyOpsLocal(model: Model, ops: Op[]): Model {
  const m = clone(model)
  for (const op of ops) applyOne(m, op)
  m.rev += 1
  m.meta = { ...m.meta, updated_at: new Date().toISOString() }
  return m
}

// Inverse ops for one op, evaluated against the state immediately before it.
// Returns [] for ops we cannot deterministically reverse (e.g. duplicate_board,
// whose id the UI does not control — chunk 7 never emits it from the viewport).
function invertOne(op: Op, before: Model): Op[] {
  switch (op.op) {
    case 'add_board': {
      const id = op.board.id
      return id ? [{ op: 'remove_board', id }] : []
    }
    case 'update_board': {
      const board = before.boards.find((b) => b.id === op.id)
      if (!board) return []
      const patch: Record<string, unknown> = {}
      for (const key of Object.keys(op.patch)) patch[key] = (board as Record<string, unknown>)[key]
      return [{ op: 'update_board', id: op.id, patch } as unknown as Op]
    }
    case 'transform_board': {
      const board = before.boards.find((b) => b.id === op.id)
      if (!board) return []
      return [{ op: 'transform_board', id: op.id, pos: board.transform.pos, rot: board.transform.rot }]
    }
    case 'remove_board': {
      const board = before.boards.find((b) => b.id === op.id)
      if (!board) return []
      const joints = before.joints.filter((j) => j.a === op.id || j.b === op.id)
      return [
        { op: 'add_board', board },
        ...joints.map((j) => ({ op: 'add_joint', joint: j }) as Op),
      ]
    }
    case 'add_joint': {
      const id = op.joint.id
      return id ? [{ op: 'remove_joint', id }] : []
    }
    case 'update_joint': {
      const joint = before.joints.find((j) => j.id === op.id) as
        | (Joint & { params: Record<string, unknown> })
        | undefined
      if (!joint) return []
      const patch: { enabled?: boolean; params?: Record<string, unknown> } = { enabled: joint.enabled }
      if (op.patch.params) {
        const params: Record<string, unknown> = {}
        for (const key of Object.keys(op.patch.params)) params[key] = joint.params[key]
        patch.params = params
      }
      return [{ op: 'update_joint', id: op.id, patch }]
    }
    case 'remove_joint': {
      const joint = before.joints.find((j) => j.id === op.id)
      return joint ? [{ op: 'add_joint', joint }] : []
    }
    case 'group': {
      return op.id ? [{ op: 'ungroup', group_id: op.id }] : []
    }
    case 'ungroup': {
      const group = before.groups.find((g) => g.id === op.group_id)
      return group
        ? [{ op: 'group', member_ids: group.members, name: group.name, id: group.id }]
        : []
    }
    case 'set_model_meta': {
      const patch: { name?: string; notes?: string } = {}
      if (op.patch.name !== undefined) patch.name = before.name
      if (op.patch.notes !== undefined) patch.notes = before.meta.notes
      return [{ op: 'set_model_meta', patch }]
    }
    case 'duplicate_board':
      return []
  }
}

// Inverse of a whole op batch: each op is inverted against the state that
// preceded it, then the inverse chunks are applied in reverse order. Returns []
// if any op is non-invertible — the caller then declines to push an undo entry.
export function invertOps(ops: Op[], before: Model): Op[] {
  const cur = clone(before)
  const chunks: Op[][] = []
  for (const op of ops) {
    const inv = invertOne(op, cur)
    if (inv.length === 0 && op.op !== 'set_model_meta') return []
    chunks.push(inv)
    applyOne(cur, op)
  }
  return chunks.reverse().flat()
}
