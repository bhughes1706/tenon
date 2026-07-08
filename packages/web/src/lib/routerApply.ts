// Router-mode paint/toggle (docs/chunk17-design.md §3.5, §19.2). Clicking an arris is one
// undoable update_board that replaces the board's whole edge_profiles array (the server's
// generic patch spread replaces it wholesale, same as edge_grooves) — no dedicated op.
//
// Toggle semantics: clicking an arris that already carries a profile REMOVES it; clicking
// a clear arris ADDS the picked bit's profile. Painting the same arris with a different
// bit REPLACES the existing entry.
import type { Board, EdgeProfile, Op } from '@tenon/core'
import type { Arris } from '../viewport/arrisPick.js'

// The new edge_profiles array after painting `arris` with `profile` (null → the picked
// bit produced nothing, treated as a plain toggle-off of any existing entry there).
export function paintedProfiles(board: Board, arris: Arris, profile: EdgeProfile | null): EdgeProfile[] {
  const existing = board.edge_profiles ?? []
  const at = existing.find((p) => p.edge === arris.edge && p.face === arris.face)
  const without = existing.filter((p) => !(p.edge === arris.edge && p.face === arris.face))
  // Clear arris + a bit → add. Occupied arris + same-ish click → toggle off. Occupied +
  // a new profile → replace (the caller decides which by whether it re-passed a profile).
  if (!profile) return without
  if (at && at.bit_id === profile.bit_id && at.profile === profile.profile) return without // toggle off
  return [...without, profile]
}

// The op to dispatch for a paint. Always an update_board patching edge_profiles whole.
export function paintOp(board: Board, arris: Arris, profile: EdgeProfile | null): Op {
  return { op: 'update_board', id: board.id, patch: { edge_profiles: paintedProfiles(board, arris, profile) } }
}
