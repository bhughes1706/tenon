import { z } from 'zod'
import { BoardSchema, BoardDimsSchema, BoardTransformSchema } from './board.js'
import {
  ButtParamsSchema,
  RabbetParamsSchema,
  HousingParamsSchema,
  HalfLapParamsSchema,
  BridleParamsSchema,
  MortiseTennonParamsSchema,
  BoxJointParamsSchema,
  DovetailParamsSchema,
  MiterParamsSchema,
} from './joint.js'

// ── Board input (id optional — server assigns on add_board) ──────────────────
const BoardInputSchema = BoardSchema.extend({ id: z.string().optional() })

// ── Board patch (update_board) ───────────────────────────────────────────────
// Partial of all board fields except id (which is the lookup key).
const BoardPatchSchema = BoardSchema.omit({ id: true }).partial()

// ── Joint input (id optional — server assigns on add_joint) ─────────────────
// Mirrors JointSchema but with optional id; params validated per-type.
const jointInputBase = z.object({
  id: z.string().optional(),
  a: z.string(),
  b: z.string(),
  enabled: z.boolean().default(true),
})
const JointInputSchema = z.discriminatedUnion('type', [
  jointInputBase.extend({ type: z.literal('butt'),          params: ButtParamsSchema }),
  jointInputBase.extend({ type: z.literal('rabbet'),        params: RabbetParamsSchema }),
  jointInputBase.extend({ type: z.literal('housing'),       params: HousingParamsSchema }),
  jointInputBase.extend({ type: z.literal('half_lap'),      params: HalfLapParamsSchema }),
  jointInputBase.extend({ type: z.literal('bridle'),        params: BridleParamsSchema }),
  jointInputBase.extend({ type: z.literal('mortise_tenon'), params: MortiseTennonParamsSchema }),
  jointInputBase.extend({ type: z.literal('box_joint'),     params: BoxJointParamsSchema }),
  jointInputBase.extend({ type: z.literal('dovetail'),      params: DovetailParamsSchema }),
  jointInputBase.extend({ type: z.literal('miter'),         params: MiterParamsSchema }),
])

// ── Joint patch (update_joint — params/enabled only) ────────────────────────
// params is untyped here; type-specific param validation runs at evaluation.
const JointPatchSchema = z.object({
  params: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

// ── Op schemas (§4.1) ────────────────────────────────────────────────────────

const AddBoardOpSchema = z.object({
  op: z.literal('add_board'),
  board: BoardInputSchema,
})

const UpdateBoardOpSchema = z.object({
  op: z.literal('update_board'),
  id: z.string(),
  patch: BoardPatchSchema,
})

// Hot path — separated from update_board for undo granularity (§4.1)
const TransformBoardOpSchema = z.object({
  op: z.literal('transform_board'),
  id: z.string(),
  pos: BoardTransformSchema.shape.pos.optional(),
  rot: BoardTransformSchema.shape.rot.optional(),
})

const DuplicateBoardOpSchema = z.object({
  op: z.literal('duplicate_board'),
  id: z.string(),
  offset: z.tuple([z.number(), z.number(), z.number()]),
  mirror: z.enum(['x', 'y', 'z']).optional(),
})

const RemoveBoardOpSchema = z.object({
  op: z.literal('remove_board'),
  id: z.string(),
})

const AddJointOpSchema = z.object({
  op: z.literal('add_joint'),
  joint: JointInputSchema,
})

const UpdateJointOpSchema = z.object({
  op: z.literal('update_joint'),
  id: z.string(),
  patch: JointPatchSchema,
})

const RemoveJointOpSchema = z.object({
  op: z.literal('remove_joint'),
  id: z.string(),
})

const GroupOpSchema = z.object({
  op: z.literal('group'),
  member_ids: z.array(z.string()).min(2),
  name: z.string().optional(),
  id: z.string().optional(),  // server assigns if omitted
})

const UngroupOpSchema = z.object({
  op: z.literal('ungroup'),
  group_id: z.string(),
})

const SetModelMetaOpSchema = z.object({
  op: z.literal('set_model_meta'),
  patch: z.object({
    name: z.string().optional(),
    notes: z.string().optional(),
  }),
})

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
export type AddBoardOp      = z.infer<typeof AddBoardOpSchema>
export type UpdateBoardOp   = z.infer<typeof UpdateBoardOpSchema>
export type TransformBoardOp = z.infer<typeof TransformBoardOpSchema>
export type DuplicateBoardOp = z.infer<typeof DuplicateBoardOpSchema>
export type RemoveBoardOp   = z.infer<typeof RemoveBoardOpSchema>
export type AddJointOp      = z.infer<typeof AddJointOpSchema>
export type UpdateJointOp   = z.infer<typeof UpdateJointOpSchema>
export type RemoveJointOp   = z.infer<typeof RemoveJointOpSchema>
export type GroupOp         = z.infer<typeof GroupOpSchema>
export type UngroupOp       = z.infer<typeof UngroupOpSchema>
export type SetModelMetaOp  = z.infer<typeof SetModelMetaOpSchema>

// §4.2: ops endpoint request body
export const ApplyOpsRequestSchema = z.object({
  expected_rev: z.number().int().nonnegative(),
  ops: z.array(OpSchema).min(1),
})
export type ApplyOpsRequest = z.infer<typeof ApplyOpsRequestSchema>
