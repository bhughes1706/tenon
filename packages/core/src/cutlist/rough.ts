// §7.2 — rough-stock allowances. Solid lumber is bought oversize and milled to finished
// dims, so the cut list quotes the ROUGH size. Length +1", width +1/4", and thickness
// rounds UP to the next standard rough thickness (quarter system, nominal inches: 4/4 = 1").

export const LENGTH_ALLOWANCE = 1 // in (§7.2)
export const WIDTH_ALLOWANCE = 1 / 4 // in (§7.2)

// Finished thickness → next standard rough stock, returned in NOMINAL inches (the unit
// board-feet are priced in: 4/4 counts as 1", 5/4 as 1.25", etc.). Thresholds verbatim
// from §7.2: ≤13/16 → 4/4; ≤1-1/16 → 5/4; ≤1-5/16 → 6/4; ≤1-13/16 → 8/4; else 12/4.
export function roughThickness(finishedT: number): number {
  if (finishedT <= 13 / 16) return 1.0 // 4/4
  if (finishedT <= 1 + 1 / 16) return 1.25 // 5/4
  if (finishedT <= 1 + 5 / 16) return 1.5 // 6/4
  if (finishedT <= 1 + 13 / 16) return 2.0 // 8/4
  return 3.0 // 12/4
}

// The nominal-quarter label for a rough thickness, for display ("4/4", "8/4").
export function quarterLabel(roughT: number): string {
  return `${Math.round(roughT * 4)}/4`
}
