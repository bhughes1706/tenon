import { z } from 'zod'

// §3.4 — board-level feature, runs before joint evaluation
export const EdgeGrooveSchema = z.object({
  id: z.string(),
  edge: z.enum(['top', 'bottom', 'left', 'right']),
  depth: z.number().positive(),
  width: z.number().positive(),
  offset: z.number().default(0),
  stopped: z.boolean().default(false),
  stop_near: z.number().nullable().default(null),
  stop_far: z.number().nullable().default(null),
})
export type EdgeGroove = z.infer<typeof EdgeGrooveSchema>

// §3.1 — set when kind === 'panel' and wide stock isn't available
export const GlueUpSchema = z.object({
  max_strip_width: z.number().positive().default(5.5),
  strips: z.number().int().min(2),
})
export type GlueUp = z.infer<typeof GlueUpSchema>

// All dims in decimal inches (§2.1)
export const BoardDimsSchema = z.object({
  l: z.number().positive(),
  w: z.number().positive(),
  t: z.number().positive(),
})
export type BoardDims = z.infer<typeof BoardDimsSchema>

// pos: [x,y,z] inches; rot: [rx,ry,rz] Euler XYZ degrees (§2.2)
export const BoardTransformSchema = z.object({
  pos: z.tuple([z.number(), z.number(), z.number()]),
  rot: z.tuple([z.number(), z.number(), z.number()]),
})
export type BoardTransform = z.infer<typeof BoardTransformSchema>

// §3.1 Board
export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['board', 'sheet', 'panel']).default('board'),
  dims: BoardDimsSchema,
  species: z.string(),
  grain: z.enum(['x', 'y']).default('x'),
  transform: BoardTransformSchema,
  qty: z.number().int().positive().default(1),
  tags: z.array(z.string()).default([]),
  locked: z.boolean().default(false),
  glue_up: GlueUpSchema.nullable().default(null),
  edge_grooves: z.array(EdgeGrooveSchema).default([]),
})
export type Board = z.infer<typeof BoardSchema>
