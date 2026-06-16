// JointFn registry — type → cutter recipe (docs/chunk9-design.md §3). evaluate.ts looks
// a joint's function up here; a type with no entry (box_joint / dovetail / miter, the
// §5.7–5.9 deferred joints) gets a JOINT_FEATURE_UNIMPLEMENTED warning instead of a carve.
import type { JointType } from '../../joint.js'
import type { JointFn } from '../types.js'
import { butt } from './butt.js'
import { rabbet } from './rabbet.js'
import { housing } from './housing.js'
import { halfLap } from './halfLap.js'
import { bridle } from './bridle.js'
import { mortiseTenon } from './mortiseTenon.js'

export const JOINT_FNS: Partial<Record<JointType, JointFn>> = {
  butt,
  rabbet,
  housing,
  half_lap: halfLap,
  bridle,
  mortise_tenon: mortiseTenon,
}

export { butt, rabbet, housing, halfLap, bridle, mortiseTenon }
