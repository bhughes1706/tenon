import { z } from 'zod'
import type { Model } from './model.js'
import type { Board } from './board.js'
import { OpSchema } from './ops.js'
import type { Op } from './ops.js'
import { JOINT_PARAM_SCHEMAS } from './joint.js'
import type { JointType } from './joint.js'
import type { Warning } from './common.js'
import { checkJointPrecondition } from './geometry/preconditions.js'
import { checkEdgeProfiles } from './geometry/edgeProfiles.js'

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
  locked: Map<string, boolean>
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
        errors.push(`ops[${i}]: ${formatIssue(issue, ops[i])}`)
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [], ops: [] }

  // Step 2 — referential integrity, op by op. Stops at the first failing op:
  // past a failure the simulated state is no longer meaningful.
  const sim: SimState = {
    boards: new Set(model.boards.map(b => b.id)),
    locked: new Map(model.boards.map(b => [b.id, b.locked])),
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

  // Step 3 — joint geometric preconditions (§4.2 step 3, §5 "Requires"). Hard-fails
  // an add_joint whose overlap can't support the type. Analytic core — no Manifold.
  // (Step 4, the Manifold display carve, runs in the web worker, not here — the
  // server returns warnings, not meshes; see docs/chunk9-design.md §"Why the worker".)
  //
  // NOTE: a move/update that invalidates an EXISTING joint (§2.4 #3) is no longer
  // soft-warned here — that lint is persistent state, not an op property, so it lives
  // in geometry/collision.ts recomputeWarnings(), which every model set re-runs
  // (client optimistic + server post-commit). Warning here too would double-emit.
  const step3errors = checkAddJointPreconditions(parsed, model)
  if (step3errors.length > 0) return { ok: false, errors: step3errors, warnings: [], ops: [] }

  return { ok: true, errors: [], warnings: [], ops: parsed }
}

// Step 3 helper. Rebuilds post-batch board geometry (dims + transform only — that's
// all preconditions read), then hard-checks each add_joint against it.
function checkAddJointPreconditions(parsed: Op[], model: Model): string[] {
  const boards = new Map<string, Board>(model.boards.map((b) => [b.id, b]))
  const addJointChecks: { index: number; type: JointType; a: string; b: string; params: Record<string, unknown> }[] = []
  // Boards touched by add_board/update_board → the op index that last touched them, so an
  // edge-profile error (§3.5) can point back at the op that introduced it.
  const touched = new Map<string, number>()

  parsed.forEach((op, index) => {
    switch (op.op) {
      case 'add_board':
        if (op.board.id) {
          boards.set(op.board.id, op.board as Board)
          touched.set(op.board.id, index)
        }
        break
      case 'update_board': {
        const cur = boards.get(op.id)
        if (cur) {
          boards.set(op.id, { ...cur, ...op.patch } as Board)
          touched.set(op.id, index)
        }
        break
      }
      case 'transform_board': {
        const cur = boards.get(op.id)
        if (cur) {
          boards.set(op.id, {
            ...cur,
            transform: { pos: op.pos ?? cur.transform.pos, rot: op.rot ?? cur.transform.rot },
          })
        }
        break
      }
      case 'remove_board':
        boards.delete(op.id)
        break
      case 'add_joint': {
        const { type, a, b, params } = op.joint
        addJointChecks.push({ index, type, a, b, params: (params ?? {}) as Record<string, unknown> })
        break
      }
      default:
        break
    }
  })

  // Hard preconditions on newly added joints, evaluated against final batch geometry.
  const errors: string[] = []
  for (const c of addJointChecks) {
    const a = boards.get(c.a)
    const b = boards.get(c.b)
    if (!a || !b) continue // unreachable after step 2, but stay defensive
    const res = checkJointPrecondition(c.type, a, b, c.params)
    if (!res.ok) errors.push(`ops[${c.index}] (add_joint): ${res.reason}`)
  }

  // Hard edge-profile checks (§3.5) against final batch geometry, on every touched board.
  for (const [id, index] of touched) {
    const board = boards.get(id)
    if (!board) continue
    for (const msg of checkEdgeProfiles(board)) errors.push(`ops[${index}] (${parsed[index].op}): ${msg}`)
  }
  return errors
}

// The op names, derived from OpSchema so the teaching text can never drift from the
// actual union (add an op → it shows up in every "unknown op" rejection for free).
const OP_NAMES: string[] = OpSchema.options.map((o) => (o.shape.op as z.ZodLiteral<string>).value)

function formatIssue(issue: z.ZodIssue, raw?: unknown): string {
  // Unknown `op` value — the single most common Claude mistake (§11.4). Name the value
  // it sent and list every op it could have meant, so the next attempt converges instead
  // of guessing. zod's default discriminator message doesn't echo the received value.
  if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
    const got = (raw as { op?: unknown } | null | undefined)?.op
    const gotStr = typeof got === 'string' ? `'${got}'` : JSON.stringify(got)
    return `unknown op ${gotStr} — valid ops are: ${OP_NAMES.join(', ')}`
  }
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}

// Errors must teach (§11.4): when an op references an id that isn't there, show the ids
// that ARE — Claude reads the rejection and retries against real ids rather than guessing.
// Capped so a large model doesn't dump hundreds of ids into one error string.
function known(ids: Iterable<string>, kind: string): string {
  const list = [...ids]
  if (list.length === 0) return `no ${kind}s exist in this model yet`
  if (list.length <= 10) return `existing ${kind} ids: ${list.join(', ')}`
  return `${list.length} ${kind}s exist — fetch the model (get_model) to list their ids`
}

const noBoard = (id: string, sim: SimState): string =>
  `board '${id}' does not exist — ${known(sim.boards, 'board')}. To reference a board you're ` +
  `adding in this same batch, give its add_board an explicit board.id: an omitted id is ` +
  `server-assigned and not visible to later ops in the batch.`

const noJoint = (id: string, sim: SimState): string =>
  `joint '${id}' does not exist — ${known(sim.joints.keys(), 'joint')}.`

const noGroup = (id: string, sim: SimState): string =>
  `group '${id}' does not exist — ${known(sim.groups, 'group')}.`

// Checks one op against the simulated state; on success, applies its effect
// so subsequent ops in the batch see it.
function checkAndApply(op: Op, sim: SimState): string[] {
  switch (op.op) {
    case 'add_board': {
      const id = op.board.id
      if (id !== undefined) {
        if (sim.boards.has(id))
          return [`board '${id}' already exists — omit board.id to have the server assign a fresh one, or pick an id not already in use.`]
        sim.boards.add(id)
        sim.locked.set(id, op.board.locked ?? false)
      }
      return []
    }

    case 'update_board': {
      if (!sim.boards.has(op.id)) return [noBoard(op.id, sim)]
      // A locked board rejects edits — except the unlock patch itself, so it can
      // be freed again.
      if (sim.locked.get(op.id) && op.patch.locked !== false) {
        return [`board '${op.id}' is locked — unlock it first with an update_board patch {"locked": false} (that op may be earlier in this same batch), then apply your edit.`]
      }
      if (op.patch.locked !== undefined) sim.locked.set(op.id, op.patch.locked)
      return []
    }

    case 'transform_board': {
      if (!sim.boards.has(op.id)) return [noBoard(op.id, sim)]
      if (sim.locked.get(op.id))
        return [`board '${op.id}' is locked — unlock it first with update_board {"locked": false}, then move it.`]
      if (!op.pos && !op.rot)
        return ['transform_board needs pos or rot (or both) — supply a new position [x,y,z], a rotation [rx,ry,rz], or both.']
      return []
    }

    case 'duplicate_board':
      // The duplicate's id is server-assigned; nothing to add to the sim.
      return sim.boards.has(op.id) ? [] : [noBoard(op.id, sim)]

    case 'remove_board': {
      if (!sim.boards.has(op.id)) return [noBoard(op.id, sim)]
      if (sim.locked.get(op.id))
        return [`board '${op.id}' is locked — unlock it first with update_board {"locked": false}, then remove it.`]
      sim.boards.delete(op.id)
      sim.locked.delete(op.id)
      // Cascade (§4.1): joints referencing the board go with it.
      for (const [jointId, joint] of sim.joints) {
        if (joint.a === op.id || joint.b === op.id) sim.joints.delete(jointId)
      }
      return []
    }

    case 'add_joint': {
      const errs: string[] = []
      const { id, a, b, type } = op.joint
      if (a === b) errs.push(`a joint's 'a' and 'b' must be different boards (both were '${a}') — set one side to the other board being joined.`)
      if (!sim.boards.has(a)) errs.push(noBoard(a, sim))
      if (!sim.boards.has(b)) errs.push(noBoard(b, sim))
      if (id !== undefined && sim.joints.has(id))
        errs.push(`joint '${id}' already exists — omit joint.id to have the server assign a fresh one, or pick an unused id.`)
      if (errs.length > 0) return errs
      if (id !== undefined) sim.joints.set(id, { type, a, b })
      return []
    }

    case 'update_joint': {
      const joint = sim.joints.get(op.id)
      if (!joint) return [noJoint(op.id, sim)]
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
      if (!sim.joints.has(op.id)) return [noJoint(op.id, sim)]
      sim.joints.delete(op.id)
      return []
    }

    case 'group': {
      const errs: string[] = []
      for (const memberId of op.member_ids) {
        if (!sim.boards.has(memberId)) errs.push(noBoard(memberId, sim))
      }
      if (op.id !== undefined && sim.groups.has(op.id))
        errs.push(`group '${op.id}' already exists — omit id to have the server assign a fresh one, or pick an unused id.`)
      if (errs.length > 0) return errs
      if (op.id !== undefined) sim.groups.add(op.id)
      return []
    }

    case 'ungroup': {
      if (!sim.groups.has(op.group_id)) return [noGroup(op.group_id, sim)]
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
