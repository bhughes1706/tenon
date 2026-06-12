import { z } from 'zod'

// §9 — settings table (key/value pairs; value is JSON scalar or object)
// §17.7 — density breakpoints: comfortable = 40px row / 14px base; shop = 52px / 17px base
export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  density: z.enum(['comfortable', 'compact', 'shop']),
  snap_grid: z.number().positive(),           // inches; default 1/16
  fraction_precision: z.number().int().positive(),  // denominator; default 16
  default_species: z.string(),
  waste_factor_solid: z.number().min(0).max(1),
  waste_factor_sheet: z.number().min(0).max(1),
  labor_rate: z.number().positive().nullable(),  // $/hr; null = not set
  viewport_shadows: z.boolean(),
})
export type Settings = z.infer<typeof SettingsSchema>
export type SettingsKey = keyof Settings

// §9 seed rows
export const SETTINGS_DEFAULTS: Settings = {
  theme: 'system',
  density: 'comfortable',
  snap_grid: 1 / 16,
  fraction_precision: 16,
  default_species: 'spc_red_oak',
  waste_factor_solid: 0.20,
  waste_factor_sheet: 0.10,
  labor_rate: null,
  viewport_shadows: true,
}

// Partial patch — used by /api/settings PATCH
export const SettingsPatchSchema = SettingsSchema.partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>
