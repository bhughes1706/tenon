export const WarningCode = {
  UNRESOLVED_COLLISION: 'UNRESOLVED_COLLISION',
  THIN_MORTISE_WALL: 'THIN_MORTISE_WALL',
  THIN_TENON: 'THIN_TENON',
  NEAR_THROUGH: 'NEAR_THROUGH',
  PANEL_MOVEMENT: 'PANEL_MOVEMENT',
  MOVEMENT_MISMATCH: 'MOVEMENT_MISMATCH',
  WIDE_PANEL_NO_GLUEUP: 'WIDE_PANEL_NO_GLUEUP',
  // chunk 9 — geometry evaluator
  JOINT_PRECONDITION_FAILED: 'JOINT_PRECONDITION_FAILED', // existing joint no longer satisfies its "requires" row (§2.4 #3)
  JOINT_FEATURE_UNIMPLEMENTED: 'JOINT_FEATURE_UNIMPLEMENTED', // param accepted but its geometry isn't carved yet (§5.6)
  // chunk 12 — full §5.6 mortise & tenon (docs/chunk12-design.md)
  HAUNCH_NO_GROOVE: 'HAUNCH_NO_GROOVE', // haunched M&T but no governing edge_groove on the mortised member
  HAUNCH_GROOVE_MISMATCH: 'HAUNCH_GROOVE_MISMATCH', // haunch stub won't seat in the groove it should fill
  WEDGE_NEEDS_THROUGH: 'WEDGE_NEEDS_THROUGH', // wedged M&T on a blind mortise — flare/kerfs skipped
  DRAWBORE_NO_ROOM: 'DRAWBORE_NO_ROOM', // pin setback lands past the tenon — pin skipped
  // chunk 16 — box joint + dovetail (docs/chunk16-design.md §6)
  BOX_THIN_END_PIN: 'BOX_THIN_END_PIN', // box-joint end fingers < half the pin width
  BOX_NOT_THROUGH: 'BOX_NOT_THROUGH', // box fingers stop short of the outer face (through by definition)
  DOVETAIL_THIN_PIN: 'DOVETAIL_THIN_PIN', // narrowest pin/half-pin under 1/4" — no chisel / fragile
  DOVETAIL_NOT_THROUGH: 'DOVETAIL_NOT_THROUGH', // through-dovetail tails stop short of showing
  DOVETAIL_LAP_CAPPED: 'DOVETAIL_LAP_CAPPED', // half-blind engagement capped by the lap
} as const

export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode]

export type Warning = {
  // (string & {}) keeps autocomplete for the known codes while allowing
  // forward-compatible codes from later chunks
  code: WarningCode | (string & {})
  boards?: string[]
  joints?: string[]
  msg: string
}

// §17.5: confirmed enum values for labor categories
export const LaborCategory = {
  design: 'design',
  milling: 'milling',
  joinery: 'joinery',
  assembly: 'assembly',
  finishing: 'finishing',
  install: 'install',
  other: 'other',
} as const

export type LaborCategory = (typeof LaborCategory)[keyof typeof LaborCategory]

// §4.2 response shape — shared by REST and MCP
export type OpResult = {
  ok: boolean
  rev: number
  applied: string[]
  warnings: Warning[]
  errors: string[]
}
