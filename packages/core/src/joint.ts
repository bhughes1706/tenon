import { z } from 'zod'
import { idSchema } from './ids.js'

// ── Per-type param schemas (§5) ──────────────────────────────────────────────
// Optional fields = geometry-derived defaults computed at evaluation time
// (they depend on board dims or the overlap, unknowable at schema level).
// Static defaults are .default() and filled at parse time.
// All schemas are .strict(): a typo'd param name must fail loudly, or Claude
// believes the edit took effect when it was silently dropped (§11.4).

// §5.1 butt
export const ButtParamsSchema = z
  .object({
    fastener: z.enum(['none', 'screw', 'dowel', 'domino', 'pocket_screw']).default('none'),
    count: z.number().int().positive().optional(), // auto: 1 per 3" of joint width, min 2
    dia: z.number().positive().default(3 / 8), // dowel diameter
  })
  .strict()
export type ButtParams = z.infer<typeof ButtParamsSchema>

// §5.2 rabbet
export const RabbetParamsSchema = z
  .object({
    depth: z.number().positive().optional(), // default t_a / 2
    width: z.number().positive().optional(), // default t_b
  })
  .strict()
export type RabbetParams = z.infer<typeof RabbetParamsSchema>

// §5.3 housing (covers dado + groove — orientation is derived, not stored)
export const HousingParamsSchema = z
  .object({
    depth: z.number().positive().optional(), // default t_a / 3
    fit_allowance: z.number().nonnegative().default(0), // dadoes cut to fit
    stopped: z.boolean().default(false),
    stop_offset: z.number().positive().default(3 / 4),
    shoulder: z.boolean().default(false), // rabbeted shelf end so dado width < t_b
    shoulder_depth: z.number().positive().optional(),
  })
  .strict()
export type HousingParams = z.infer<typeof HousingParamsSchema>

// §5.4 half_lap
export const HalfLapParamsSchema = z
  .object({
    split: z.number().gt(0).lt(1).default(0.5), // fraction of overlap height removed from a
    on_top: z.enum(['a', 'b']).optional(), // derived from world Y; override
  })
  .strict()
export type HalfLapParams = z.infer<typeof HalfLapParamsSchema>

// §5.5 bridle (open mortise & tenon)
export const BridleParamsSchema = z
  .object({
    tenon_fraction: z.number().gt(0).lt(1).default(1 / 3),
    snap_to_tool: z.boolean().default(true), // round tenon thickness to nearest 1/8
  })
  .strict()
export type BridleParams = z.infer<typeof BridleParamsSchema>

// §5.6 mortise_tenon (flagship)
export const MortiseTenonParamsSchema = z
  .object({
    thickness_fraction: z.number().gt(0).lt(1).default(1 / 3), // fraction of t_b
    thickness: z.number().positive().optional(), // absolute override; wins over fraction
    snap_to_tool: z.boolean().default(true), // round thickness to nearest 1/16
    through: z.boolean().optional(), // derived: engagement ≥ t_a − 1/64
    depth: z.number().positive().optional(), // default engagement; blind capped at t_a − 1/4
    width_shoulders: z
      .tuple([z.number().nonnegative(), z.number().nonnegative()])
      .default([3 / 8, 3 / 8]), // top/bottom shoulders along b's width; 0 = full-width tenon
    haunch: z.enum(['none', 'square', 'sloped']).default('none'),
    haunch_depth: z.number().positive().optional(), // default = governing edge_groove.depth (§3.4)
    haunch_len: z.number().positive().optional(), // default 1/3 tenon width
    wedged: z.boolean().default(false), // through only
    wedge_kerfs: z.number().int().positive().default(2),
    drawbore: z.boolean().default(false),
    pin_dia: z.number().positive().default(3 / 8),
    drawbore_offset: z.number().positive().default(1 / 16),
    twin: z.boolean().default(false), // two tenons across b's width (wide rails)
  })
  .strict()
export type MortiseTenonParams = z.infer<typeof MortiseTenonParamsSchema>

// §5.7 box_joint
export const BoxJointParamsSchema = z
  .object({
    pin_width: z.number().positive().optional(), // default t of thinner board, snapped 1/4–3/4
    start: z.enum(['pin', 'socket']).default('pin'),
  })
  .strict()
export type BoxJointParams = z.infer<typeof BoxJointParamsSchema>

// §5.8 dovetail
export const DovetailParamsSchema = z
  .object({
    slope: z.string().regex(/^\d+:\d+$/, "slope must be a ratio like '1:8'").default('1:8'),
    pins: z.union([z.literal('auto'), z.number().int().positive()]).default('auto'),
    half_pin_width: z.number().positive().optional(), // default 1/2 tail width
    variant: z.enum(['through', 'half_blind']).default('through'),
    lap: z.number().positive().optional(), // default t_a / 4 (half_blind only)
  })
  .strict()
export type DovetailParams = z.infer<typeof DovetailParamsSchema>

// §5.9 miter
export const MiterParamsSchema = z
  .object({
    spline: z.boolean().default(false),
    spline_t: z.number().positive().optional(),
    spline_depth: z.number().positive().optional(),
  })
  .strict()
export type MiterParams = z.infer<typeof MiterParamsSchema>

// ── Param schema registry ────────────────────────────────────────────────────
// Single source of truth for type → params. Used by JointSchema below,
// JointInputSchema in ops.ts, per-type patch validation in validators.ts,
// and (chunk 13) MCP tool input schemas.

export const JOINT_PARAM_SCHEMAS = {
  butt: ButtParamsSchema,
  rabbet: RabbetParamsSchema,
  housing: HousingParamsSchema,
  half_lap: HalfLapParamsSchema,
  bridle: BridleParamsSchema,
  mortise_tenon: MortiseTenonParamsSchema,
  box_joint: BoxJointParamsSchema,
  dovetail: DovetailParamsSchema,
  miter: MiterParamsSchema,
} as const

export type JointType = keyof typeof JOINT_PARAM_SCHEMAS
export const JOINT_TYPES = Object.keys(JOINT_PARAM_SCHEMAS) as JointType[]

// The 9 variants differ only in the base they extend (doc joints require id;
// op inputs make it optional). Building both unions from one helper prevents
// the two lists from drifting when a joint type is added.
export function jointVariants<S extends z.ZodRawShape>(base: z.ZodObject<S>) {
  return [
    base.extend({ type: z.literal('butt'), params: JOINT_PARAM_SCHEMAS.butt }),
    base.extend({ type: z.literal('rabbet'), params: JOINT_PARAM_SCHEMAS.rabbet }),
    base.extend({ type: z.literal('housing'), params: JOINT_PARAM_SCHEMAS.housing }),
    base.extend({ type: z.literal('half_lap'), params: JOINT_PARAM_SCHEMAS.half_lap }),
    base.extend({ type: z.literal('bridle'), params: JOINT_PARAM_SCHEMAS.bridle }),
    base.extend({ type: z.literal('mortise_tenon'), params: JOINT_PARAM_SCHEMAS.mortise_tenon }),
    base.extend({ type: z.literal('box_joint'), params: JOINT_PARAM_SCHEMAS.box_joint }),
    base.extend({ type: z.literal('dovetail'), params: JOINT_PARAM_SCHEMAS.dovetail }),
    base.extend({ type: z.literal('miter'), params: JOINT_PARAM_SCHEMAS.miter }),
  ] as const
}

// ── Joint (§3.2) ─────────────────────────────────────────────────────────────
// The joint's location is never stored — derived from the spatial relationship
// of a and b at evaluation time (§3.2).

const jointBase = z
  .object({
    id: idSchema('jnt_'),
    a: idSchema('brd_'), // role: receives (mortised, dadoed, rabbeted)
    b: idSchema('brd_'), // role: inserts (tenoned, housed)
    enabled: z.boolean().default(true),
  })
  .strict()

export const JointSchema = z.discriminatedUnion('type', [...jointVariants(jointBase)])
export type Joint = z.infer<typeof JointSchema>
