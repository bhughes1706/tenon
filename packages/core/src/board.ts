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

// §3.1 note: "glue_up.max_strip_width defaults to 5.5"" — also the cut list's threshold
// for WIDE_PANEL_NO_GLUEUP (a panel wider than this with no glue_up set), so it's exported
// rather than inlined twice.
export const DEFAULT_MAX_STRIP_WIDTH = 5.5

// §3.1 — set when kind === 'panel' and the top must be glued up from strips
export const GlueUpSchema = z
  .object({
    max_strip_width: z.number().positive().default(DEFAULT_MAX_STRIP_WIDTH),
    strips: z.number().int().min(2),
  })
  .strict()
export type GlueUp = z.infer<typeof GlueUpSchema>

// §3.4 — set on a `panel` board that floats in a surrounding frame's edge grooves.
// When set, this board's `dims.l`/`dims.w` are read as the OPENING size (the reveal the
// panel must fill once installed) rather than the panel's own milled blank size — there is
// no board/joint field anywhere that links a panel to the frame members around it, so the
// opening is a modeling convention on the panel board itself, not something derived by
// searching the model spatially. The cut list (§7, chunk 15) computes the actual blank to
// cut: opening + 2 × groove_depth − movement gap. No default for `groove_depth` — mirrors
// EdgeGrooveSchema.depth above: it must match whatever cutter actually grooved the frame,
// which isn't knowable from the panel board alone.
export const PanelFitSchema = z
  .object({
    groove_depth: z.number().positive(),
  })
  .strict()
export type PanelFit = z.infer<typeof PanelFitSchema>

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
    panel_fit: PanelFitSchema.nullable().default(null),
  })
  .strict()
export type Board = z.infer<typeof BoardSchema>
