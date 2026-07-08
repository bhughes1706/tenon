// Edge-profile geometry helpers + validation (docs/chunk17-design.md §2, §4). PURE,
// WASM-free — lives on the base `@tenon/core` entry so op-validation (validators.ts) can
// hard-check profiles without booting Manifold, exactly like the joint preconditions.
import type { Board, EdgeProfile } from '../board.js'
// profileCurve is a PURE polyline generator (no WASM) — importing the FILE (not the eval
// index, which pulls Manifold) keeps this module WASM-free, the same trick preconditions.ts
// uses for spacing.ts. Compound profiles have no closed-form extents, so we measure the
// actual swept polyline — exactly what the carve removes.
import { profileCurve } from '../eval/profiles.js'

const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}"`

// The removed cross-section's bounding extents in arris-frame: `reach` into the board
// along the edge normal, `depth` into the board along the thickness (§2).
export function profileExtents(p: EdgeProfile): { reach: number; depth: number } {
  switch (p.profile) {
    case 'roundover':
    case 'cove':
    case 'ogee':
      return { reach: p.radius, depth: p.radius }
    case 'chamfer':
      return { reach: p.width, depth: p.width }
    case 'rabbet':
      return { reach: p.width, depth: p.depth }
    case 'compound': {
      const curve = profileCurve(p)
      return {
        reach: Math.max(...curve.map((q) => q[0])),
        depth: Math.max(...curve.map((q) => q[1])),
      }
    }
  }
}

// Teaching-grade validation (§11.4 doctrine, §4). Called from validators.ts's post-batch
// board-reconstruction pass for every board touched by add_board/update_board. Returns
// one message per problem — hard errors (a profile that cuts through, meets itself, or
// duplicates an arris is not a lint-and-proceed case, it is a malformed feature).
export function checkEdgeProfiles(board: Board): string[] {
  const errors: string[] = []
  const profiles = board.edge_profiles ?? []
  if (profiles.length === 0) return errors

  // 4. A floating panel's dims are the OPENING (§3.4), not a milled blank — a router
  //    profile here doesn't correspond to a real edge. Reject the whole board's profiles.
  if (board.panel_fit) {
    errors.push(
      `${board.name} is a floating panel — its dims are the opening size (§3.4), not the ` +
        `milled blank, so a router profile here doesn't correspond to a real edge. Route the ` +
        `frame members instead.`,
    )
    return errors
  }

  const seen = new Set<string>()
  for (const p of profiles) {
    const { reach, depth } = profileExtents(p)

    // 1. Duplicate arris.
    const key = `${p.edge}/${p.face}`
    if (seen.has(key)) {
      errors.push(
        `${board.name} already has a profile on its ${p.edge} ${p.face} arris — remove it ` +
          `first, or edit that entry instead of adding a second one.`,
      )
    }
    seen.add(key)

    // 2. Depth overrun — cuts through the board's thickness.
    if (depth >= board.dims.t) {
      errors.push(
        `A ${fmt(depth)} deep ${p.profile} won't fit in a ${fmt(board.dims.t)} thick board — ` +
          `it would cut through. Use a smaller bit or a thicker board.`,
      )
    }

    // 3. Reach overrun — the profile would meet itself across the board. top/bottom cut
    //    along the width; left/right cut along the length.
    const acrossDim = p.edge === 'top' || p.edge === 'bottom' ? board.dims.w : board.dims.l
    const acrossLabel = p.edge === 'top' || p.edge === 'bottom' ? 'wide' : 'long'
    if (reach >= acrossDim / 2) {
      errors.push(
        `A ${fmt(reach)} reach ${p.profile} on the ${p.edge} edge would meet itself across a ` +
          `${fmt(acrossDim)} ${acrossLabel} board — reduce the bit size or the board dimension.`,
      )
    }

    // 5. compound shape invariants (chunk 17.1): the swept path must START on the v = 0
    //    face, END on the u = 0 wall, and stay inside the board (u, v ≥ 0). A router only
    //    removes material — a point outside the u ≥ 0, v ≥ 0 quadrant isn't a real cut.
    if (p.profile === 'compound') {
      const curve = profileCurve(p)
      const first = curve[0]
      const last = curve[curve.length - 1]
      const EPS = 1e-6
      if (Math.abs(first[1]) > EPS || Math.abs(last[0]) > EPS) {
        errors.push(
          `${board.name}'s ${p.edge}/${p.face} molding profile must start on the face (v = 0) ` +
            `and finish on the edge wall (u = 0); this one runs ${fmt(first[0])},${fmt(first[1])} → ` +
            `${fmt(last[0])},${fmt(last[1])}. Fix the bit's profile geometry.`,
        )
      }
      if (curve.some((q) => q[0] < -EPS || q[1] < -EPS)) {
        errors.push(
          `${board.name}'s ${p.edge}/${p.face} molding profile leaves the board (a point has ` +
            `u < 0 or v < 0). A router bit only removes material inside the edge — check the ` +
            `profile's coordinates.`,
        )
      }
    }
  }
  return errors
}
