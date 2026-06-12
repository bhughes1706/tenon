import { z } from 'zod'
import { BoardSchema } from './board.js'
import { JointSchema } from './joint.js'

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(z.string()),  // board ids
})
export type Group = z.infer<typeof GroupSchema>

export const ModelMetaSchema = z.object({
  notes: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ModelMeta = z.infer<typeof ModelMetaSchema>

// §3 — the model document (stored as JSON in SQLite `models.doc`)
export const ModelSchema = z.object({
  id: z.string(),
  rev: z.number().int().nonnegative(),
  doc_version: z.number().int().positive().default(1),
  name: z.string(),
  units: z.literal('in'),
  boards: z.array(BoardSchema),
  joints: z.array(JointSchema),
  groups: z.array(GroupSchema),
  meta: ModelMetaSchema,
})
export type Model = z.infer<typeof ModelSchema>
