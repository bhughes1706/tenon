// §5.2 rabbet — an L-shaped notch along an edge of board a that receives board b (e.g.
// a back panel let into the back edge of a side). One prism is removed from a; b is not
// cut. `depth` (default t_a/2) is cut into a's thickness; `width` (default t_b) is the
// strip removed from the near in-plane edge; the rabbet runs the full length of the edge.
// Boxes are EXACT; the carve opens the flush faces (overcutToBoard, gotcha #4).
import type { JointFn } from '../types.js'
import {
  worldOverlap,
  toLocal,
  fromR,
  spanBox,
  extent,
  center,
  maxAxis,
  thickAxisW,
  otherAxis,
  type Axis,
} from './util.js'

export const rabbet: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }
  const ext = extent(R)

  // The rabbet runs along a's longest contact extent (the edge); depth is cut into a's
  // thickness; the remaining axis is the face-direction strip the rabbet removes.
  const runAxis = maxAxis(ext)
  const tA = thickAxisW(a)
  const depthAxis: Axis = tA !== runAxis ? tA : (([0, 1, 2] as Axis[]).find((x) => x !== runAxis) as Axis)
  const widthAxis = otherAxis(runAxis, depthAxis)

  const depth = typeof params.depth === 'number' ? params.depth : a.board.dims.t / 2
  const width = typeof params.width === 'number' ? params.width : b.board.dims.t

  const spans = fromR(R)

  // Run axis: full edge length.
  spans[runAxis] = [a.aabb.min[runAxis], a.aabb.max[runAxis]]

  // Depth axis: from a's contacted thickness face inward by `depth`.
  const dMin = a.aabb.min[depthAxis]
  const dMax = a.aabb.max[depthAxis]
  const depthHigh = center(R)[depthAxis] >= center(a.aabb)[depthAxis]
  spans[depthAxis] = depthHigh ? [dMax - depth, dMax] : [dMin, dMin + depth]

  // Width axis: a `width` strip removed from the in-plane edge b sits against.
  const wMin = a.aabb.min[widthAxis]
  const wMax = a.aabb.max[widthAxis]
  const widthHigh = center(R)[widthAxis] >= center(a.aabb)[widthAxis]
  spans[widthAxis] = widthHigh ? [wMax - width, wMax] : [wMin, wMin + width]

  return { a: [toLocal(a, spanBox(spans), 'rabbet')], b: [], warnings: [] }
}
