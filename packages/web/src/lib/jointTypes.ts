// Pure joint-type metadata + dialog filtering logic (chunk 11). No React — testable
// standalone; the JointDialog and JointInspector render over this.
import { checkJointPrecondition } from '@tenon/core'
import type { Board, JointType } from '@tenon/core'

// First-wave implemented types (chunk 9 JOINT_FNS), in the dialog's PRESELECTION
// priority order — most specific / most demanding preconditions first, butt last
// (its precondition is bare contact, so it always passes and would mask better fits).
export const IMPLEMENTED_JOINT_TYPES = [
  'mortise_tenon',
  'housing',
  'half_lap',
  'bridle',
  'rabbet',
  'butt',
] as const satisfies readonly JointType[]

// §5.7–5.9 — schema round-trips but no carve recipe yet. Listed disabled in the dialog.
export const DEFERRED_JOINT_TYPES = ['box_joint', 'dovetail', 'miter'] as const satisfies readonly JointType[]

export const JOINT_TYPE_LABELS: Record<JointType, string> = {
  butt: 'Butt',
  rabbet: 'Rabbet',
  housing: 'Housing / dado',
  half_lap: 'Half lap',
  bridle: 'Bridle',
  mortise_tenon: 'Mortise & tenon',
  box_joint: 'Box joint',
  dovetail: 'Dovetail',
  miter: 'Miter',
}

// Role naming per §3.2: `a` receives (mortised / dadoed / rabbeted), `b` inserts
// (tenoned / housed). Shown in the dialog so the swap button is self-explaining.
export const JOINT_ROLE_HINTS: Record<JointType, { a: string; b: string }> = {
  butt: { a: 'face board', b: 'butting board' },
  rabbet: { a: 'rabbeted board', b: 'mating board' },
  housing: { a: 'housed board (gets the dado)', b: 'shelf' },
  half_lap: { a: 'lap (lower by default)', b: 'lap (upper by default)' },
  bridle: { a: 'slotted board (open mortise)', b: 'tenoned board' },
  mortise_tenon: { a: 'mortised board (stile)', b: 'tenoned board (rail)' },
  box_joint: { a: 'pin board', b: 'socket board' },
  dovetail: { a: 'pin board', b: 'tail board' },
  miter: { a: 'mitered board', b: 'mitered board' },
}

export interface JointTypeOption {
  type: JointType
  ok: boolean
  reason?: string // teaching reason when !ok (checkJointPrecondition) or "later" note
  deferred?: boolean
}

// The dialog's type list for a given (a, b) role assignment: implemented types with
// their live precondition verdicts, then the deferred types (always disabled).
export function availableJointTypes(a: Board, b: Board): JointTypeOption[] {
  const options: JointTypeOption[] = IMPLEMENTED_JOINT_TYPES.map((type) => {
    const res = checkJointPrecondition(type, a, b, {})
    return res.ok ? { type, ok: true } : { type, ok: false, reason: res.reason }
  })
  for (const type of DEFERRED_JOINT_TYPES) {
    options.push({ type, ok: false, deferred: true, reason: 'Not carved yet — scheduled for a later chunk.' })
  }
  return options
}

// Preselect the first type whose precondition passes (priority order above).
export function defaultJointType(options: JointTypeOption[]): JointType | null {
  return options.find((o) => o.ok)?.type ?? null
}
