export const WarningCode = {
  UNRESOLVED_COLLISION: 'UNRESOLVED_COLLISION',
  THIN_MORTISE_WALL: 'THIN_MORTISE_WALL',
  THIN_TENON: 'THIN_TENON',
  NEAR_THROUGH: 'NEAR_THROUGH',
  PANEL_MOVEMENT: 'PANEL_MOVEMENT',
  MOVEMENT_MISMATCH: 'MOVEMENT_MISMATCH',
  WIDE_PANEL_NO_GLUEUP: 'WIDE_PANEL_NO_GLUEUP',
} as const

export type WarningCode = (typeof WarningCode)[keyof typeof WarningCode]

export type Warning = {
  code: WarningCode | string
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
