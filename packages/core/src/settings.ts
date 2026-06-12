import { z } from 'zod'
import { idSchema } from './ids.js'

// §9 — settings table (key/value pairs; value is JSON scalar or object)
// Density breakpoints (§17.7): comfortable = 40px row / 14px base; shop = 52px / 17px base
export const SettingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    density: z.enum(['comfortable', 'shop']),
    snap_grid: z.number().positive(), // inches; 1/16 default, 1/32 fine
    fraction_precision: z.number().int().positive(), // display denominator
    default_species: idSchema('spc_'),
    waste_factor_solid: z.number().min(0).max(1),
    waste_factor_sheet: z.number().min(0).max(1),
    labor_rate: z.number().positive().nullable(), // $/hr; null = not set
    viewport_shadows: z.boolean(),
  })
  .strict()
export type Settings = z.infer<typeof SettingsSchema>
export type SettingsKey = keyof Settings

// §9 seed rows
export const SETTINGS_DEFAULTS: Settings = {
  theme: 'system',
  density: 'comfortable',
  snap_grid: 1 / 16,
  fraction_precision: 16,
  default_species: 'spc_red_oak',
  waste_factor_solid: 0.2,
  waste_factor_sheet: 0.1,
  labor_rate: null,
  viewport_shadows: true,
}

// Partial patch — used by /api/settings PATCH
export const SettingsPatchSchema = SettingsSchema.partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>
