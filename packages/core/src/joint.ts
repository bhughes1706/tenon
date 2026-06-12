import { z } from 'zod'

// ── Per-type param schemas (§5) ──────────────────────────────────────────────
// Optional fields = geometry-derived defaults computed at evaluation time.
// Static defaults (false, 'none', etc.) are .default() on the schema.

// §5.1 butt
export const ButtParamsSchema = z.object({
  fastener: z.enum(['none', 'screw', 'dowel', 'domino', 'pocket_screw']).default('none'),
  count: z.number().int().positive().optional(),  // auto: 1 per 3", min 2
  dia: z.number().positive().optional(),          // dowel dia, default 3/8"
})
export type ButtParams = z.infer<typeof ButtParamsSchema>

// §5.2 rabbet
export const RabbetParamsSchema = z.object({
  depth: z.number().positive().optional(),  // default t_a / 2
  width: z.number().positive().optional(),  // default t_b
})
export type RabbetParams = z.infer<typeof RabbetParamsSchema>

// §5.3 housing (covers dado + groove — orientation is derived, not stored)
export const HousingParamsSchema = z.object({
  depth: z.number().positive().optional(),  // default t_a / 3
  fit_allowance: z.number().default(0),
  stopped: z.boolean().default(false),
  stop_offset: z.number().positive().optional(),  // default 3/4"
  shoulder: z.boolean().default(false),
  shoulder_depth: z.number().positive().optional(),
})
export type HousingParams = z.infer<typeof HousingParamsSchema>

// §5.4 half_lap
export const HalfLapParamsSchema = z.object({
  split: z.number().min(0).max(1).default(0.5),
  on_top: z.enum(['a', 'b']).optional(),  // derived from world Y; override possible
})
export type HalfLapParams = z.infer<typeof HalfLapParamsSchema>

// §5.5 bridle (open mortise & tenon)
export const BridleParamsSchema = z.object({
  tenon_fraction: z.number().min(0).max(1).default(1 / 3),
  snap_to_tool: z.boolean().default(true),
})
export type BridleParams = z.infer<typeof BridleParamsSchema>

// §5.6 mortise_tenon (flagship)
export const MortiseTennonParamsSchema = z.object({
  thickness_fraction: z.number().positive().optional(),    // default 1/3 × t_b
  thickness: z.number().positive().optional(),             // absolute override
  snap_to_tool: z.boolean().default(true),                // round to nearest 1/16
  through: z.boolean().optional(),                         // derived: engagement ≥ t_a − 1/64
  depth: z.number().positive().optional(),                 // default = engagement
  width_shoulders: z.tuple([z.number(), z.number()]).default([3 / 8, 3 / 8]),
  haunch: z.enum(['none', 'square', 'sloped']).default('none'),
  haunch_depth: z.number().positive().optional(),          // default = governing edge_groove.depth
  haunch_len: z.number().positive().optional(),            // default 1/3 tenon width
  wedged: z.boolean().default(false),
  wedge_kerfs: z.number().int().positive().default(2),
  drawbore: z.boolean().default(false),
  pin_dia: z.number().positive().default(3 / 8),
  drawbore_offset: z.number().positive().default(1 / 16),
  twin: z.boolean().default(false),
})
export type MortiseTennonParams = z.infer<typeof MortiseTennonParamsSchema>

// §5.7 box_joint
export const BoxJointParamsSchema = z.object({
  pin_width: z.number().positive().optional(),  // default t of thinner board, snapped 1/4–3/4
  start: z.enum(['pin', 'socket']).default('pin'),
})
export type BoxJointParams = z.infer<typeof BoxJointParamsSchema>

// §5.8 dovetail
export const DovetailParamsSchema = z.object({
  slope: z.string().default('1:8'),  // '1:8' | '1:6' | custom string
  pins: z.union([z.literal('auto'), z.number().int().positive()]).default('auto'),
  half_pin_width: z.number().positive().optional(),
  variant: z.enum(['through', 'half_blind']).default('through'),
  lap: z.number().positive().optional(),  // default t_a / 4 (half_blind only)
})
export type DovetailParams = z.infer<typeof DovetailParamsSchema>

// §5.9 miter
export const MiterParamsSchema = z.object({
  spline: z.boolean().default(false),
  spline_t: z.number().positive().optional(),
  spline_depth: z.number().positive().optional(),
})
export type MiterParams = z.infer<typeof MiterParamsSchema>

// ── Joint (§3.2) ─────────────────────────────────────────────────────────────
// Discriminated on 'type' so params are typed per variant.

const jointBase = z.object({
  id: z.string(),
  a: z.string(),  // role: receives (mortised, rabbeted, etc.)
  b: z.string(),  // role: inserts (tenoned, etc.)
  enabled: z.boolean().default(true),
})

export const JointSchema = z.discriminatedUnion('type', [
  jointBase.extend({ type: z.literal('butt'),          params: ButtParamsSchema }),
  jointBase.extend({ type: z.literal('rabbet'),        params: RabbetParamsSchema }),
  jointBase.extend({ type: z.literal('housing'),       params: HousingParamsSchema }),
  jointBase.extend({ type: z.literal('half_lap'),      params: HalfLapParamsSchema }),
  jointBase.extend({ type: z.literal('bridle'),        params: BridleParamsSchema }),
  jointBase.extend({ type: z.literal('mortise_tenon'), params: MortiseTennonParamsSchema }),
  jointBase.extend({ type: z.literal('box_joint'),     params: BoxJointParamsSchema }),
  jointBase.extend({ type: z.literal('dovetail'),      params: DovetailParamsSchema }),
  jointBase.extend({ type: z.literal('miter'),         params: MiterParamsSchema }),
])
export type Joint = z.infer<typeof JointSchema>
export type JointType = Joint['type']
