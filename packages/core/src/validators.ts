import { z } from 'zod'
import type { Model } from './model.js'
import { OpSchema } from './ops.js'
import type { Op } from './ops.js'
import { JOINT_PARAM_SCHEMAS } from './joint.js'
import type { JointType } from './joint.js'
import type { Warning } from './common.js'

export type ValidationResult = {
  ok: boolean
  errors: string[]
  warnings: Warning[]
  // Parsed ops with defaults filled — what the server should apply.
  // Empty unless ok.
  ops: Op[]
}

type SimJoint = { type: JointType; a: string; b: string }

type SimState = {
  boards: Set<string>
  joints: Map<string, SimJoint>
  groups: Set<string>
}

// §4.2 validation pipeline, steps 1–2 (steps 3–4 need geometry — chunk 9).
// Accepts unknown[]: ops arrive as raw JSON from REST and MCP; parsing IS step 1.
//
// Referential checks run against a simulated board/joint/group set updated as
// each op is checked, so one batch may add a board and joint it in the same
// call — ops are transactional per call (§4.2). Entities created without an
// explicit id get server-assigned ids; later ops in the batch cannot reference
// those (the caller doesn't know the id yet).
export function validateOps(ops: unknown[], model: Model): ValidationResult {
  // Step 1 — schema. Every op is checked so the caller sees all shape errors at once.
  const errors: string[] = []
  const parsed: Op[] = []
  for (let i = 0; i < ops.length; i++) {
    const result = OpSchema.safeParse(ops[i])
    if (result.success) {
      parsed.push(result.data)
    } else {
      for (const issue of result.error.issues) {
        errors.push(`ops[${i}]: ${formatIssue(issue)}`)
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [], ops: [] }

  // Step 2 — referential integrity, op by op. Stops at the first failing op:
  // past a failure the simulated state is no longer meaningful.
  const sim: SimState = {
    boards: new Set(model.boards.map(b => b.id)),
    joints: new Map(model.joints.map(j => [j.id, { type: j.type, a: j.a, b: j.b }])),
    groups: new Set(model.groups.map(g => g.id)),
  }
  for (let i = 0; i < parsed.length; i++) {
    const op = parsed[i]
    const opErrors = checkAndApply(op, sim)
    if (opErrors.length > 0) {
      return {
        ok: false,
        errors: opErrors.map(e => `ops[${i}] (${op.op}): ${e}`),
        warnings: [],
        ops: [],
      }
    }
  }

  // Steps 3–4 (joint geometric preconditions, evaluation) land with the evaluator (chunk 9).
  return { ok: true, errors: [], warnings: [], ops: parsed }
}

function formatIssue(issue: z.ZodIssue): string {
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}

// Checks one op against the simulated state; on success, applies its effect
// so subsequent ops in the batch see it.
function checkAndApply(op: Op, sim: SimState): string[] {
  switch (op.op) {
    case 'add_board': {
      const id = op.board.id
      if (id !== undefined) {
        if (sim.boards.has(id)) return [`board '${id}' already exists`]
        sim.boards.add(id)
      }
      return []
    }

    case 'update_board':
      return sim.boards.has(op.id) ? [] : [`board '${op.id}' does not exist`]

    case 'transform_board': {
      if (!sim.boards.has(op.id)) return [`board '${op.id}' does not exist`]
      if (!op.pos && !op.rot) return ['transform_board requires pos or rot (or both)']
      return []
    }

    case 'duplicate_board':
      // The duplicate's id is server-assigned; nothing to add to the sim.
      return sim.boards.has(op.id) ? [] : [`board '${op.id}' does not exist`]

    case 'remove_board': {
      if (!sim.boards.has(op.id)) return [`board '${op.id}' does not exist`]
      sim.boards.delete(op.id)
      // Cascade (§4.1): joints referencing the board go with it.
      for (const [jointId, joint] of sim.joints) {
        if (joint.a === op.id || joint.b === op.id) sim.joints.delete(jointId)
      }
      return []
    }

    case 'add_joint': {
      const errs: string[] = []
      const { id, a, b, type } = op.joint
      if (a === b) errs.push(`joint 'a' and 'b' must be different boards (both '${a}')`)
      if (!sim.boards.has(a)) errs.push(`board '${a}' does not exist`)
      if (!sim.boards.has(b)) errs.push(`board '${b}' does not exist`)
      if (id !== undefined && sim.joints.has(id)) errs.push(`joint '${id}' already exists`)
      if (errs.length > 0) return errs
      if (id !== undefined) sim.joints.set(id, { type, a, b })
      return []
    }

    case 'update_joint': {
      const joint = sim.joints.get(op.id)
      if (!joint) return [`joint '${op.id}' does not exist`]
      // Per-type param validation: the patch schema alone can't know the joint
      // type, but we can — validate provided params against the type's schema.
      if (op.patch.params !== undefined) {
        const paramSchema = JOINT_PARAM_SCHEMAS[joint.type] as z.AnyZodObject
        const result = paramSchema.partial().safeParse(op.patch.params)
        if (!result.success) {
          return result.error.issues.map(
            issue => `patch.params (joint type '${joint.type}'): ${formatIssue(issue)}`,
          )
        }
      }
      return []
    }

    case 'remove_joint': {
      if (!sim.joints.has(op.id)) return [`joint '${op.id}' does not exist`]
      sim.joints.delete(op.id)
      return []
    }

    case 'group': {
      const errs: string[] = []
      for (const memberId of op.member_ids) {
        if (!sim.boards.has(memberId)) errs.push(`board '${memberId}' does not exist`)
      }
      if (op.id !== undefined && sim.groups.has(op.id)) errs.push(`group '${op.id}' already exists`)
      if (errs.length > 0) return errs
      if (op.id !== undefined) sim.groups.add(op.id)
      return []
    }

    case 'ungroup': {
      if (!sim.groups.has(op.group_id)) return [`group '${op.group_id}' does not exist`]
      sim.groups.delete(op.group_id)
      return []
    }

    case 'set_model_meta':
      return []
  }

  // Exhaustiveness guard — fails to compile if an op type is added to OpSchema
  // without a case above ("strict" does not include noImplicitReturns).
  return assertNever(op)
}

function assertNever(x: never): never {
  throw new Error(`unhandled op: ${JSON.stringify(x)}`)
}
