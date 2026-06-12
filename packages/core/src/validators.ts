import type { Model } from './model.js'
import { OpSchema } from './ops.js'
import type { Op } from './ops.js'
import type { Warning } from './common.js'

export type ValidationResult = {
  ok: boolean
  errors: string[]
  warnings: Warning[]
}

// §4.2 validation pipeline (steps 1–2; steps 3–4 require geometry — chunk 9).
// Accepts unknown[] because ops arrive as raw JSON from REST / MCP; parsing is step 1.
export function validateOps(ops: unknown[], model: Model): ValidationResult {
  // Step 1: Schema validation
  const parsedOps: Op[] = []
  for (const op of ops) {
    const parsed = OpSchema.safeParse(op)
    if (!parsed.success) {
      const errors = parsed.error.issues.map(i => {
        const path = i.path.length > 0 ? `${i.path.join('.')}: ` : ''
        return `${path}${i.message}`
      })
      return { ok: false, errors, warnings: [] }
    }
    parsedOps.push(parsed.data)
  }

  // Step 2: Referential integrity
  const refs = {
    boardIds: new Set(model.boards.map(b => b.id)),
    jointIds: new Set(model.joints.map(j => j.id)),
    groupIds: new Set(model.groups.map(g => g.id)),
  }

  for (const op of parsedOps) {
    const errors = checkRefs(op, refs)
    if (errors.length > 0) {
      return { ok: false, errors, warnings: [] }
    }
  }

  // Step 3: Joint geometric preconditions — stub (implemented in chunk 9)
  // Step 4: Geometry evaluation — stub (implemented in chunk 9)

  return { ok: true, errors: [], warnings: [] }
}

type Refs = {
  boardIds: Set<string>
  jointIds: Set<string>
  groupIds: Set<string>
}

function checkRefs(op: Op, refs: Refs): string[] {
  switch (op.op) {
    case 'add_board':
      return []

    case 'update_board':
      return refs.boardIds.has(op.id) ? [] : [`board '${op.id}' does not exist`]

    case 'transform_board':
      if (!refs.boardIds.has(op.id)) return [`board '${op.id}' does not exist`]
      if (!op.pos && !op.rot) return [`transform_board must provide pos or rot`]
      return []

    case 'duplicate_board':
      return refs.boardIds.has(op.id) ? [] : [`board '${op.id}' does not exist`]

    case 'remove_board':
      return refs.boardIds.has(op.id) ? [] : [`board '${op.id}' does not exist`]

    case 'add_joint': {
      const errors: string[] = []
      const { a, b } = op.joint
      if (a === b) errors.push(`joint 'a' and 'b' must be different boards`)
      if (!refs.boardIds.has(a)) errors.push(`board '${a}' does not exist`)
      if (!refs.boardIds.has(b)) errors.push(`board '${b}' does not exist`)
      return errors
    }

    case 'update_joint':
      return refs.jointIds.has(op.id) ? [] : [`joint '${op.id}' does not exist`]

    case 'remove_joint':
      return refs.jointIds.has(op.id) ? [] : [`joint '${op.id}' does not exist`]

    case 'group': {
      const errors: string[] = []
      for (const memberId of op.member_ids) {
        if (!refs.boardIds.has(memberId)) errors.push(`board '${memberId}' does not exist`)
      }
      return errors
    }

    case 'ungroup':
      return refs.groupIds.has(op.group_id) ? [] : [`group '${op.group_id}' does not exist`]

    case 'set_model_meta':
      return []
  }
}
