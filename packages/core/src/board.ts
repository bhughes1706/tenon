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

// §3.5 — edge profile (router mode), a board-level feature carved before joint
// evaluation, like EdgeGrooveSchema above. A router bit shapes ONE arris: an
// `edge` (top/bottom/left/right, the §3.4 enum) × `face` (front = +thickness,
// back = −thickness, board-local). Denormalized: the removed geometry (radius/
// width/depth) lives on the board, not looked up from the `bits` store at eval
// time, so the worker and WASM-free cut-list server never touch the DB and
// retiring a bit never invalidates a saved model — `bit_id` is provenance only.
//
// Discriminated union on `profile` (§3.5, §11.4): a stray `radius` on a rabbet
// is a hard validation error, not a silently-ignored field.
const arrisFields = {
  id: idSchema('epf_'),
  edge: z.enum(['top', 'bottom', 'left', 'right']), // board-local, per §3.4
  face: z.enum(['front', 'back']), // front = +thickness/+z, back = −thickness/−z
  // Which bit-store entry filled these dims — a semantic slug ('bit_roundover_14'),
  // NOT a prefixed id, and NOT dereferenced by the evaluator. Nullable.
  bit_id: z.string().nullable().default(null),
}

// A single leg of a `compound` profile path (chunk 17.1). Segments chain from the
// profile's `start` point; each ends at `to`. A `line` is straight; an `arc` sweeps
// around `center` in the given direction (its radius is |start−center|, and it lands
// exactly on `to` — data with a mismatched |to−center| gets a small end kink, so a bit's
// arcs should share a consistent radius). All coordinates are ARRIS-FRAME (u, v).
export const ProfileSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('line'), to: z.tuple([z.number(), z.number()]) }).strict(),
  z
    .object({
      kind: z.literal('arc'),
      to: z.tuple([z.number(), z.number()]),
      center: z.tuple([z.number(), z.number()]),
      dir: z.enum(['cw', 'ccw']),
    })
    .strict(),
])
export type ProfileSegment = z.infer<typeof ProfileSegmentSchema>

export const EdgeProfileSchema = z.discriminatedUnion('profile', [
  z.object({ profile: z.literal('roundover'), radius: z.number().positive(), ...arrisFields }).strict(),
  z.object({ profile: z.literal('cove'), radius: z.number().positive(), ...arrisFields }).strict(),
  z.object({ profile: z.literal('ogee'), radius: z.number().positive(), ...arrisFields }).strict(),
  z.object({ profile: z.literal('chamfer'), width: z.number().positive(), ...arrisFields }).strict(), // 45° implied (v1)
  z.object({ profile: z.literal('rabbet'), width: z.number().positive(), depth: z.number().positive(), ...arrisFields }).strict(),
  // §3.5 chunk 17.1 — an arbitrary molding profile (picture-frame, classical, cove+bead…)
  // as DATA rather than a named primitive: an arris-frame polyline path the carve sweeps
  // verbatim. `start` is on the v = 0 face (start[1] = 0); the last segment ends on the
  // u = 0 wall (to[0] = 0). `label` is the bit's human name, copied at paint time so the
  // cut list + inspector stay legible without a DB lookup (the geometry is denormalized
  // like every other profile). See geometry/edgeProfiles.ts for the shape invariants.
  z
    .object({
      profile: z.literal('compound'),
      start: z.tuple([z.number(), z.number()]),
      segments: z.array(ProfileSegmentSchema).min(1),
      label: z.string().optional(),
      ...arrisFields,
    })
    .strict(),
])
export type EdgeProfile = z.infer<typeof EdgeProfileSchema>

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
    edge_profiles: z.array(EdgeProfileSchema).default([]), // §3.5 router mode
    panel_fit: PanelFitSchema.nullable().default(null),
  })
  .strict()
export type Board = z.infer<typeof BoardSchema>
