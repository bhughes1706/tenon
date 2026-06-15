import type { Model, Group } from '@tenon/core'

// Groups use soft references: remove_board intentionally does NOT prune
// group.members because pruning would make the op non-invertible. Filter at
// consumption sites instead of at delete time.
export function liveMembers(model: Model, group: Group): string[] {
  const live = new Set(model.boards.map((b) => b.id))
  return group.members.filter((id) => live.has(id))
}
