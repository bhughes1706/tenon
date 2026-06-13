// Settings are stored server-side and mirrored to localStorage (§20.5).
// All values are JSON scalars; the server returns them pre-parsed.

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  density: 'comfortable' | 'shop'
  fraction_precision: 16 | 32 | 64
  snap_grid: 0.0625 | 0.03125 | 0
  default_species: string
  viewport_shadows: boolean
  waste_factor_solid: number
  waste_factor_sheet: number
  labor_rate: number | null
  default_deposit_pct: number | null
}

export async function getSettings(): Promise<Settings> {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error(`settings fetch failed: ${res.status}`)
  return res.json() as Promise<Settings>
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`settings patch failed: ${res.status}`)
  return res.json() as Promise<Settings>
}
