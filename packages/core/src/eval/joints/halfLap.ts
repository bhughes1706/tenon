// §5.4 half_lap — two crossing/overlapping boards each lose half their thickness in the
// overlap so they interlock flush. The cut plane splits the overlap along its thinnest
// axis (the stacked-thickness direction); one board keeps the side it sits on and loses
// the other. COMPLEMENT invariant (§6.1): removed_a + removed_b = overlap volume — the
// two removals meet exactly at the split plane (interior, no overcut), and the in-plane
// footprint is the EXACT overlap so neither board loses material outside the lap.
import type { JointFn } from '../types.js'
import { worldOverlap, toLocal, fromR, spanBox, extent, center, minAxis } from './util.js'

export const halfLap: JointFn = (a, b, params) => {
  const R = worldOverlap(a, b)
  if (!R) return { a: [], b: [], warnings: [] }

  // Split along the overlap's thinnest axis — for two flat crossing boards that's the
  // stacked-thickness direction (the contact normal). ASSUMPTION: the thinnest overlap
  // axis is the stacking axis. Holds for typical crossing and face-laps. Breaks for an
  // end-lap where the engagement length is shorter than the stock thickness — there
  // minAxis picks the length axis and the split goes the wrong way. Acceptable for v1
  // (end-laps with thin stock are uncommon); tighten by preferring the axis of greatest
  // board-centre separation if this becomes a real issue.
  const s = minAxis(extent(R))
  const H = R.max[s] - R.min[s]

  // `split` = fraction of the overlap thickness removed from board a (default 0.5).
  const split = typeof params.split === 'number' ? params.split : 0.5
  const removeA = split * H

  // Which board sits on top: explicit override, else the one whose centre is higher
  // along the split axis (the design's "world-Y of overlap", generalised to the split
  // axis so it's rotation-independent).
  const onTop = params.on_top === 'a' || params.on_top === 'b'
    ? params.on_top
    : center(a.aabb)[s] >= center(b.aabb)[s] ? 'a' : 'b'

  // The top board keeps its top and loses its lower part; the bottom board the reverse.
  // The two removals tile [R.min, R.max] at the cut plane → complement holds exactly.
  // The other two axes stay the EXACT overlap (fromR) — the carve overcuts only the
  // faces that turn out flush with a board face.
  const aSpans = fromR(R)
  const bSpans = fromR(R)
  if (onTop === 'a') {
    aSpans[s] = [R.min[s], R.min[s] + removeA]
    bSpans[s] = [R.min[s] + removeA, R.max[s]]
  } else {
    aSpans[s] = [R.max[s] - removeA, R.max[s]]
    bSpans[s] = [R.min[s], R.max[s] - removeA]
  }

  return {
    a: [toLocal(a, spanBox(aSpans), 'lap')],
    b: [toLocal(b, spanBox(bSpans), 'lap')],
    warnings: [],
  }
}
