import { z } from 'zod'
import { idSchema } from './ids.js'
import { BoardSchema } from './board.js'
import { JointSchema } from './joint.js'

export const GroupSchema = z
  .object({
    id: idSchema('grp_'),
    name: z.string(),
    members: z.array(idSchema('brd_')), // groups move as a unit in UI; no geometric meaning (§4.1)
  })
  .strict()
export type Group = z.infer<typeof GroupSchema>

export const ModelMetaSchema = z
  .object({
    notes: z.string().default(''),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict()
export type ModelMeta = z.infer<typeof ModelMetaSchema>

// §3 — the model document (stored as JSON in SQLite models.doc)
export const ModelSchema = z
  .object({
    id: idSchema('mdl_'),
    rev: z.number().int().nonnegative(), // optimistic concurrency (§3.3)
    doc_version: z.number().int().positive().default(1), // document format version (§16.1)
    name: z.string(),
    units: z.literal('in').default('in'), // fixed for v1; field reserved (§3)
    boards: z.array(BoardSchema),
    joints: z.array(JointSchema),
    groups: z.array(GroupSchema),
    meta: ModelMetaSchema,
  })
  .strict()
export type Model = z.infer<typeof ModelSchema>
