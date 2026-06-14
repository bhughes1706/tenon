import type { Op, Model, Board, Joint, Group } from '@tenon/core'
import { makeBoardId, makeJointId, makeGroupId } from '@tenon/core'

export type ApplyResult = {
  model: Model
  applied: string[]
}

// Applies a validated (parsed, defaults-filled) op batch to a model document,
// returning the mutated copy and the list of server-assigned ids.
// Called only after validateOps returns ok:true — no referential checks here.
export function applyOps(ops: Op[], model: Model): ApplyResult {
  const m: Model = JSON.parse(JSON.stringify(model))
  const applied: string[] = []
  const now = new Date().toISOString()

  for (const op of ops) {
    switch (op.op) {
      case 'add_board': {
        const id = op.board.id ?? makeBoardId()
        m.boards.push({ ...op.board, id } as Board)
        applied.push(id)
        break
      }

      case 'update_board': {
        const idx = m.boards.findIndex(b => b.id === op.id)
        if (idx !== -1) {
          // patch may include nested objects (dims, transform, glue_up, edge_grooves);
          // the full sub-object is replaced when present (§4.1)
          m.boards[idx] = { ...m.boards[idx], ...op.patch } as Board
        }
        break
      }

      case 'transform_board': {
        const idx = m.boards.findIndex(b => b.id === op.id)
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
        const src = m.boards.find(b => b.id === op.id)
        if (!src) break
        const id = makeBoardId()
        const srcPos = src.transform.pos
        const pos: [number, number, number] = [
          srcPos[0] + op.offset[0],
          srcPos[1] + op.offset[1],
          srcPos[2] + op.offset[2],
        ]
        // Mirror reflects position along the given axis instead of adding the offset.
        // The geometry evaluator (chunk 9) handles true mirror geometry.
        if (op.mirror) {
          const axis = ['x', 'y', 'z'].indexOf(op.mirror) as 0 | 1 | 2
          pos[axis] = srcPos[axis] - op.offset[axis]
        }
        const dup: Board = {
          ...JSON.parse(JSON.stringify(src)),
          id,
          transform: { pos, rot: src.transform.rot },
        }
        m.boards.push(dup)
        applied.push(id)
        break
      }

      case 'remove_board': {
        m.boards = m.boards.filter(b => b.id !== op.id)
        // Cascade per §4.1 — joints referencing the board go with it
        m.joints = m.joints.filter(j => j.a !== op.id && j.b !== op.id)
        break
      }

      case 'add_joint': {
        const id = op.joint.id ?? makeJointId()
        m.joints.push({ ...op.joint, id } as Joint)
        applied.push(id)
        break
      }

      case 'update_joint': {
        const idx = m.joints.findIndex(j => j.id === op.id)
        if (idx !== -1) {
          const joint = m.joints[idx]
          const updated: Joint = {
            ...joint,
            ...(op.patch.enabled !== undefined ? { enabled: op.patch.enabled } : {}),
            ...(op.patch.params !== undefined
              ? { params: { ...(joint as Joint & { params: Record<string, unknown> }).params, ...op.patch.params } }
              : {}),
          } as Joint
          m.joints[idx] = updated
        }
        break
      }

      case 'remove_joint': {
        m.joints = m.joints.filter(j => j.id !== op.id)
        break
      }

      case 'group': {
        const id = op.id ?? makeGroupId()
        const group: Group = { id, name: op.name ?? '', members: op.member_ids }
        m.groups.push(group)
        applied.push(id)
        break
      }

      case 'ungroup': {
        m.groups = m.groups.filter(g => g.id !== op.group_id)
        break
      }

      case 'set_model_meta': {
        if (op.patch.name !== undefined) m.name = op.patch.name
        if (op.patch.notes !== undefined) m.meta = { ...m.meta, notes: op.patch.notes }
        break
      }
    }
  }

  m.rev += 1
  m.meta.updated_at = now

  return { model: m, applied }
}
