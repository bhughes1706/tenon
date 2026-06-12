import { z } from 'zod'
import { idSchema } from './ids.js'

// §9 — hardware line items (job-level or model-level)
export const HardwareSchema = z
  .object({
    id: idSchema('hdw_'),
    job_id: idSchema('job_').nullable(), // null = not yet associated with a job
    model_id: idSchema('mdl_').nullable(), // null = job-level (not tied to a model)
    item: z.string().min(1), // e.g. "3/8 brass knobs"
    qty: z.number().positive().default(1), // REAL — fractional ok (ft)
    unit: z.enum(['ea', 'pair', 'set', 'box', 'ft']).default('ea'),
    unit_cost: z.number().nonnegative().nullable().default(null), // null = to be quoted
    supplier: z.string().nullish(), // nullish: DB NULL round-trips as null
    notes: z.string().nullish(),
  })
  .strict()
export type Hardware = z.infer<typeof HardwareSchema>

// id optional — server assigns on create
export const HardwareInputSchema = HardwareSchema.extend({ id: idSchema('hdw_').optional() })
export type HardwareInput = z.infer<typeof HardwareInputSchema>
