// Pure snap solver for the transform gizmo (§13 designer UX, §2.4 overlap=engagement).
// v1 boards rotate only in 90° multiples (§12), so a board's world AABB is *exact* —
// face, edge, and end magnetism all fall out of per-axis plane snapping against the
// AABB min/max/center of nearby boards. No three.js here; unit-tested in isolation.

export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

// A transient alignment hint shown during a drag: a segment lying in the snapped
// plane, connecting the dragged board to the board it locked onto.
export interface SnapGuide {
  from: [number, number, number]
  to: [number, number, number]
}

export interface SnapResult {
  pos: [number, number, number]
  guides: SnapGuide[]
}

export interface SnapInput {
  center: [number, number, number] // raw dragged board center (from the gizmo)
  half: [number, number, number] // dragged board half-extents (world, axis-aligned)
  others: AABB[] // other boards' world AABBs (cached at drag start — they don't move)
  grid: number // grid snap in inches; 0 = off (fallback when no magnetic target)
  threshold: number // magnetic pull radius, world inches
  magnetic: boolean // false suspends magnetism (grid only) — Alt held
}

const aabbCenter = (b: AABB, ax: number) => (b.min[ax] + b.max[ax]) / 2

// 1-D interval overlap with a tolerance margin.
const overlaps1D = (aMin: number, aMax: number, bMin: number, bMax: number, margin: number) =>
  aMin <= bMax + margin && bMin <= aMax + margin

export function solveSnap(input: SnapInput): SnapResult {
  const { center: c, half, others, grid, threshold, magnetic } = input
  const dMin: [number, number, number] = [c[0] - half[0], c[1] - half[1], c[2] - half[2]]
  const dMax: [number, number, number] = [c[0] + half[0], c[1] + half[1], c[2] + half[2]]

  const pos: [number, number, number] = [c[0], c[1], c[2]]
  // Per-axis winning magnetic target (axis coordinate `t`) + the matched board's
  // center, kept so guides can be built with the *final* position afterwards.
  const winners: Array<{ t: number; oc: [number, number, number] } | null> = [null, null, null]

  for (let ax = 0; ax < 3; ax++) {
    const p1 = (ax + 1) % 3
    const p2 = (ax + 2) % 3
    // Dragged reference features along this axis and each one's offset from center.
    const features = [
      { v: dMin[ax], off: -half[ax] },
      { v: dMax[ax], off: +half[ax] },
      { v: c[ax], off: 0 },
    ]

    let best: { delta: number; newCenter: number; t: number; oc: [number, number, number] } | null = null

    if (magnetic) {
      for (const o of others) {
        // Perpendicular gate: only snap to boards facing us on the other two axes,
        // so we never magnetize to a board across the model.
        if (!overlaps1D(dMin[p1], dMax[p1], o.min[p1], o.max[p1], threshold)) continue
        if (!overlaps1D(dMin[p2], dMax[p2], o.min[p2], o.max[p2], threshold)) continue
        const targets = [o.min[ax], o.max[ax], aabbCenter(o, ax)]
        for (const t of targets) {
          for (const f of features) {
            const ad = Math.abs(t - f.v)
            if (ad <= threshold && (best === null || ad < best.delta)) {
              best = {
                delta: ad,
                newCenter: t - f.off,
                t,
                oc: [aabbCenter(o, 0), aabbCenter(o, 1), aabbCenter(o, 2)],
              }
            }
          }
        }
      }
    }

    if (best) {
      pos[ax] = best.newCenter
      winners[ax] = { t: best.t, oc: best.oc }
    } else if (grid > 0) {
      pos[ax] = Math.round(c[ax] / grid) * grid
    }
  }

  const guides: SnapGuide[] = []
  for (let ax = 0; ax < 3; ax++) {
    const w = winners[ax]
    if (!w) continue
    const from: [number, number, number] = [pos[0], pos[1], pos[2]]
    const to: [number, number, number] = [w.oc[0], w.oc[1], w.oc[2]]
    from[ax] = w.t // both endpoints sit on the aligned plane (axis coord = t)
    to[ax] = w.t
    guides.push({ from, to })
  }

  return { pos, guides }
}
