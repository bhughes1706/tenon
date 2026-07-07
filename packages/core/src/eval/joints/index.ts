// JointFn registry — type → cutter recipe (docs/chunk9-design.md §3). evaluate.ts looks
// a joint's function up here; a type with no entry (miter, the §5.9 v1.5 joint) gets a
// JOINT_FEATURE_UNIMPLEMENTED warning instead of a carve. box_joint / dovetail carve as
// of chunk 16 (docs/chunk16-design.md).
import type { JointType } from '../../joint.js'
import type { JointFn } from '../types.js'
import { butt } from './butt.js'
import { rabbet } from './rabbet.js'
import { housing } from './housing.js'
import { halfLap } from './halfLap.js'
import { bridle } from './bridle.js'
import { mortiseTenon } from './mortiseTenon.js'
import { boxJoint } from './boxJoint.js'
import { dovetail } from './dovetail.js'

export const JOINT_FNS: Partial<Record<JointType, JointFn>> = {
  butt,
  rabbet,
  housing,
  half_lap: halfLap,
  bridle,
  mortise_tenon: mortiseTenon,
  box_joint: boxJoint,
  dovetail,
}

export { butt, rabbet, housing, halfLap, bridle, mortiseTenon, boxJoint, dovetail }
