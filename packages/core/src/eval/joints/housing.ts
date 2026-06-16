// §5.3 housing (dado / groove) — a channel cut into board a's face that board b seats
// into. The orientation (dado across grain vs. groove with grain) is derived from the
// geometry, not stored. `a` receives the channel; `b` is not cut (the optional rabbeted
// `shoulder` is deferred → warns).
//
// Recipe: the channel sits where b crosses a (the world overlap), `depth` deep into a's
// contacted face (default t_a/3), as wide as b across the channel, and running the full
// board edge-to-edge along the crossing direction (a stopped dado pulls one end in).
// Boxes are EXACT; the carve opens the mouth + run-ends (overcutToBoard, gotcha #4).
import type { JointFn } from '../types.js'
import {
  worldOverlap,
  toLocal,
  fromR,
  spanBox,
  extent,
  center,
  minAxis,
  unimplemented,
} from './util.js'

export const housing: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }
  const ext = extent(R)

  // Contact normal = the axis with the smallest overlap (b seats into a's face along it).
  const depthAxis = minAxis(ext)
  // The two in-plane axes of the channel.
  const inPlane = ([0, 1, 2] as const).filter((x) => x !== depthAxis) as [0 | 1 | 2, 0 | 1 | 2]
  // run = the direction the channel travels across a (b spans the larger footprint);
  // width = b's thickness (the narrow footprint = the slot width).
  const runAxis = ext[inPlane[0]] >= ext[inPlane[1]] ? inPlane[0] : inPlane[1]
  const widthAxis = runAxis === inPlane[0] ? inPlane[1] : inPlane[0]

  const depth = typeof params.depth === 'number' ? params.depth : a.board.dims.t / 3
  const fit = typeof params.fit_allowance === 'number' ? params.fit_allowance : 0
  const stopped = params.stopped === true
  const stopOffset = typeof params.stop_offset === 'number' ? params.stop_offset : 3 / 4

  const spans = fromR(R)

  // Depth axis: cut from the contacted face inward by `depth`.
  const aMin = a.aabb.min[depthAxis]
  const aMax = a.aabb.max[depthAxis]
  const contactHigh = center(R)[depthAxis] >= center(a.aabb)[depthAxis]
  spans[depthAxis] = contactHigh ? [aMax - depth, aMax] : [aMin, aMin + depth]

  // Width axis: b's footprint plus the fit allowance (dadoes are cut a hair wide).
  spans[widthAxis] = [R.min[widthAxis] - fit / 2, R.max[widthAxis] + fit / 2]

  // Run axis: full board edge-to-edge, or a stopped dado that stops `stop_offset` short
  // of the low end (the visible front edge — that wall is interior so it survives).
  const runLo = a.aabb.min[runAxis]
  const runHi = a.aabb.max[runAxis]
  spans[runAxis] = stopped ? [runLo + stopOffset, runHi] : [runLo, runHi]

  const warnings = params.shoulder === true ? [unimplemented('housing', 'shoulder')] : []
  return { a: [toLocal(a, spanBox(spans), 'dado')], b: [], warnings }
}
