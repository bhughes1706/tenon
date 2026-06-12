import { z } from 'zod'

// §9 — hardware line items (job-level or model-level)
export const HardwareSchema = z.object({
  id: z.string(),
  job_id: z.string().nullable(),    // null = not yet associated with a job
  model_id: z.string().nullable(),  // null = job-level (not tied to a model)
  item: z.string(),
  qty: z.number().positive().default(1),
  unit: z.enum(['ea', 'pair', 'set', 'box', 'ft']).default('ea'),
  unit_cost: z.number().nonnegative().nullable().default(null),  // null = to be quoted
  supplier: z.string().optional(),
  notes: z.string().optional(),
})
export type Hardware = z.infer<typeof HardwareSchema>

// id optional — server assigns on create
export const HardwareInputSchema = HardwareSchema.extend({ id: z.string().optional() })
export type HardwareInput = z.infer<typeof HardwareInputSchema>
