import { z } from 'zod'
import { idSchema } from './ids.js'
import { BoardSchema, BoardTransformSchema } from './board.js'
import { jointVariants } from './joint.js'

// ── Board input / patch ──────────────────────────────────────────────────────

// id optional — server assigns when omitted (§4.1)
export const BoardInputSchema = BoardSchema.extend({ id: idSchema('brd_').optional() })
export type BoardInput = z.infer<typeof BoardInputSchema>

// Every board field is patchable except id. This is also the only channel for
// editing edge_grooves, glue_up, and panel_fit — there are no dedicated ops for them (§4.1).
export const BoardPatchSchema = BoardSchema.omit({ id: true }).partial()
export type BoardPatch = z.infer<typeof BoardPatchSchema>

// ── Joint input / patch ──────────────────────────────────────────────────────

const jointInputBase = z
  .object({
    id: idSchema('jnt_').optional(), // server assigns when omitted
    a: idSchema('brd_'),
    b: idSchema('brd_'),
    enabled: z.boolean().default(true),
  })
  .strict()

export const JointInputSchema = z.discriminatedUnion('type', [...jointVariants(jointInputBase)])
export type JointInput = z.infer<typeof JointInputSchema>

// params is shape-checked only at this level; per-joint-type validation happens
// in validateOps, which can look up the target joint's type in the model.
export const JointPatchSchema = z
  .object({
    params: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
export type JointPatch = z.infer<typeof JointPatchSchema>

// ── Op schemas (§4.1) ────────────────────────────────────────────────────────

const AddBoardOpSchema = z
  .object({
    op: z.literal('add_board'),
    board: BoardInputSchema,
  })
  .strict()

const UpdateBoardOpSchema = z
  .object({
    op: z.literal('update_board'),
    id: idSchema('brd_'),
    patch: BoardPatchSchema,
  })
  .strict()

// Hot path — separated from update_board for undo granularity (§4.1)
const TransformBoardOpSchema = z
  .object({
    op: z.literal('transform_board'),
    id: idSchema('brd_'),
    pos: BoardTransformSchema.shape.pos.optional(),
    rot: BoardTransformSchema.shape.rot.optional(),
  })
  .strict()

const DuplicateBoardOpSchema = z
  .object({
    op: z.literal('duplicate_board'),
    id: idSchema('brd_'),
    offset: z.tuple([z.number(), z.number(), z.number()]),
    mirror: z.enum(['x', 'y', 'z']).optional(), // for left/right parts
  })
  .strict()

const RemoveBoardOpSchema = z
  .object({
    op: z.literal('remove_board'), // cascades: removes joints referencing it (§4.1)
    id: idSchema('brd_'),
  })
  .strict()

const AddJointOpSchema = z
  .object({
    op: z.literal('add_joint'),
    joint: JointInputSchema,
  })
  .strict()

const UpdateJointOpSchema = z
  .object({
    op: z.literal('update_joint'),
    id: idSchema('jnt_'),
    patch: JointPatchSchema,
  })
  .strict()

const RemoveJointOpSchema = z
  .object({
    op: z.literal('remove_joint'),
    id: idSchema('jnt_'),
  })
  .strict()

const GroupOpSchema = z
  .object({
    op: z.literal('group'),
    member_ids: z.array(idSchema('brd_')).min(2),
    name: z.string().optional(),
    id: idSchema('grp_').optional(), // server assigns when omitted
  })
  .strict()

const UngroupOpSchema = z
  .object({
    op: z.literal('ungroup'),
    group_id: idSchema('grp_'),
  })
  .strict()

const SetModelMetaOpSchema = z
  .object({
    op: z.literal('set_model_meta'),
    patch: z
      .object({
        name: z.string().optional(),
        notes: z.string().optional(),
      })
      .strict(),
  })
  .strict()

// ── Union ────────────────────────────────────────────────────────────────────

export const OpSchema = z.discriminatedUnion('op', [
  AddBoardOpSchema,
  UpdateBoardOpSchema,
  TransformBoardOpSchema,
  DuplicateBoardOpSchema,
  RemoveBoardOpSchema,
  AddJointOpSchema,
  UpdateJointOpSchema,
  RemoveJointOpSchema,
  GroupOpSchema,
  UngroupOpSchema,
  SetModelMetaOpSchema,
])
export type Op = z.infer<typeof OpSchema>

// Individual op types — useful for exhaustive switch branches
export type AddBoardOp = z.infer<typeof AddBoardOpSchema>
export type UpdateBoardOp = z.infer<typeof UpdateBoardOpSchema>
export type TransformBoardOp = z.infer<typeof TransformBoardOpSchema>
export type DuplicateBoardOp = z.infer<typeof DuplicateBoardOpSchema>
export type RemoveBoardOp = z.infer<typeof RemoveBoardOpSchema>
export type AddJointOp = z.infer<typeof AddJointOpSchema>
export type UpdateJointOp = z.infer<typeof UpdateJointOpSchema>
export type RemoveJointOp = z.infer<typeof RemoveJointOpSchema>
export type GroupOp = z.infer<typeof GroupOpSchema>
export type UngroupOp = z.infer<typeof UngroupOpSchema>
export type SetModelMetaOp = z.infer<typeof SetModelMetaOpSchema>

// §4.2: ops endpoint request body — shared by REST and apply_model_ops (MCP)
export const ApplyOpsRequestSchema = z
  .object({
    expected_rev: z.number().int().nonnegative(),
    ops: z.array(OpSchema).min(1),
  })
  .strict()
export type ApplyOpsRequest = z.infer<typeof ApplyOpsRequestSchema>
