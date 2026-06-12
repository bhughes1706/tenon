import { z } from 'zod'
import { idSchema } from './ids.js'

// All object schemas in core are .strict(): unknown keys are rejected, never
// silently stripped. A typo'd field that vanishes without an error is the
// failure mode that breaks the Claude edit loop (§11.4 — errors must teach).

// §3.4 — board-level feature, runs before joint evaluation
export const EdgeGrooveSchema = z
  .object({
    id: idSchema('egv_'),
    edge: z.enum(['top', 'bottom', 'left', 'right']), // board-local
    depth: z.number().positive(), // spec default t_board/3 depends on the board — required here
    width: z.number().positive().default(0.25), // 1/4" standard slot cutter
    offset: z.number().default(0), // from center of edge
    stopped: z.boolean().default(false), // true for haunched panel slots
    stop_near: z.number().nonnegative().nullable().default(null), // distance from ends when stopped
    stop_far: z.number().nonnegative().nullable().default(null),
  })
  .strict()
export type EdgeGroove = z.infer<typeof EdgeGrooveSchema>

// §3.1 — set when kind === 'panel' and the top must be glued up from strips
export const GlueUpSchema = z
  .object({
    max_strip_width: z.number().positive().default(5.5),
    strips: z.number().int().min(2),
  })
  .strict()
export type GlueUp = z.infer<typeof GlueUpSchema>

// All dims in decimal inches (§2.1); these are finished dimensions (§3.1)
export const BoardDimsSchema = z
  .object({
    l: z.number().positive(),
    w: z.number().positive(),
    t: z.number().positive(),
  })
  .strict()
export type BoardDims = z.infer<typeof BoardDimsSchema>

// pos: [x,y,z] inches; rot: [rx,ry,rz] Euler XYZ degrees (§2.2)
export const BoardTransformSchema = z
  .object({
    pos: z.tuple([z.number(), z.number(), z.number()]),
    rot: z.tuple([z.number(), z.number(), z.number()]),
  })
  .strict()
export type BoardTransform = z.infer<typeof BoardTransformSchema>

// §3.1 Board
export const BoardSchema = z
  .object({
    id: idSchema('brd_'),
    name: z.string(),
    kind: z.enum(['board', 'sheet', 'panel']).default('board'),
    dims: BoardDimsSchema,
    species: idSchema('spc_'),
    grain: z.enum(['x', 'y']).default('x'),
    transform: BoardTransformSchema,
    qty: z.number().int().positive().default(1),
    tags: z.array(z.string()).default([]),
    locked: z.boolean().default(false),
    glue_up: GlueUpSchema.nullable().default(null),
    edge_grooves: z.array(EdgeGrooveSchema).default([]),
  })
  .strict()
export type Board = z.infer<typeof BoardSchema>
