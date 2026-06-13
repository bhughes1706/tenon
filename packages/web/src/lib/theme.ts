import { syncViewportTheme } from './syncViewportTheme.js'

export type ThemeValue = 'system' | 'light' | 'dark'
export type DensityValue = 'comfortable' | 'shop'

// Resolve "system" to the OS preference; "light"/"dark" pass through.
function resolveTheme(theme: ThemeValue): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Apply theme + density to <html> and sync the viewport (no-op until chunk 7).
export function applyTheme(theme: ThemeValue, density: DensityValue = 'comfortable'): void {
  const resolved = resolveTheme(theme)
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.setAttribute('data-density', density)
  // Viewport sync runs in the same frame so three.js follows immediately.
  syncViewportTheme()
}

let _systemListener: (() => void) | null = null

// Start listening for OS dark/light changes when theme is "system".
// Calling again replaces the previous listener.
export function listenSystemTheme(onChangeTheme: ThemeValue, density: DensityValue): void {
  if (_systemListener) {
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', _systemListener)
    _systemListener = null
  }
  if (onChangeTheme === 'system') {
    _systemListener = () => applyTheme('system', density)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', _systemListener)
  }
}

const LS_THEME_KEY = 'tenon:theme'
const LS_DENSITY_KEY = 'tenon:density'

// Bootstrap: apply from localStorage immediately (avoids FOUC), then the
// useSettings hook fetches from the server and calls applyTheme again.
export function initTheme(): void {
  const theme = (localStorage.getItem(LS_THEME_KEY) ?? 'system') as ThemeValue
  const density = (localStorage.getItem(LS_DENSITY_KEY) ?? 'comfortable') as DensityValue
  applyTheme(theme, density)
  listenSystemTheme(theme, density)
}

export function persistThemeLocally(theme: ThemeValue, density: DensityValue): void {
  localStorage.setItem(LS_THEME_KEY, theme)
  localStorage.setItem(LS_DENSITY_KEY, density)
}
