// Flat per-species colors for the viewport (§8 — "ship flat colors first").
// Wood color is PHYSICAL: it is never themed and does not respond to dark mode
// (§20.3). Textures are a later polish pass; these approximate finished tone.

const SPECIES_COLORS: Record<string, string> = {
  spc_red_oak: '#c9a06a',
  spc_white_oak: '#d6c193',
  spc_hard_maple: '#e8d8b0',
  spc_soft_maple: '#e2d2ad',
  spc_black_cherry: '#9c5a3c',
  spc_black_walnut: '#5c4536',
  spc_ash: '#d9c8a3',
  spc_poplar: '#cdcaa0',
  spc_ew_pine: '#e7d3a2',
  spc_sy_pine: '#d8b878',
  spc_hickory: '#caa97a',
  spc_sapele: '#8a4f33',
  spc_wr_cedar: '#b07a57',
  spc_bb_ply_12: '#d8c089',
  spc_bb_ply_34: '#d8c089',
  spc_mdf_34: '#b8aa92',
}

// Deterministic warm fallback for user-added species not in the seed set.
function hashColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const hue = 25 + (Math.abs(h) % 30) // 25–55° — wood-ish warm band
  const sat = 35 + (Math.abs(h >> 3) % 20)
  const light = 50 + (Math.abs(h >> 6) % 18)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

export function speciesColor(speciesId: string): string {
  return SPECIES_COLORS[speciesId] ?? hashColor(speciesId)
}
