import { useState, useEffect, useCallback } from 'react'
import { type Settings, getSettings, patchSettings } from '../lib/api.js'
import { applyTheme, listenSystemTheme, persistThemeLocally, parseStoredTheme, parseStoredDensity } from '../lib/theme.js'

const LS_KEY = 'tenon:settings'

function readLocalSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Settings> = { ...parsed as Partial<Settings> }
    // Validate the two fields that affect the DOM immediately; invalid values
    // from a corrupted store would silently break theming before the server fetch.
    out.theme = parseStoredTheme(typeof parsed.theme === 'string' ? parsed.theme : null)
    out.density = parseStoredDensity(typeof parsed.density === 'string' ? parsed.density : null)
    return out
  } catch {
    return {}
  }
}

function writeLocalSettings(s: Settings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch { /* storage full — ignore */ }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyFromSettings = useCallback((s: Settings) => {
    applyTheme(s.theme, s.density)
    listenSystemTheme(s.theme, s.density)
    persistThemeLocally(s.theme, s.density)
    writeLocalSettings(s)
  }, [])

  useEffect(() => {
    let cancelled = false

    const local = readLocalSettings()
    if (local.theme || local.density) {
      setSettings(prev => ({ ...(prev ?? {} as Settings), ...local }))
    }

    getSettings()
      .then(s => {
        if (cancelled) return
        setSettings(s)
        applyFromSettings(s)
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'settings load failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [applyFromSettings])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setError(null)
    const prev = settings
    // Optimistic update
    setSettings(s => s ? { ...s, ...patch } : null)
    if (settings && (patch.theme !== undefined || patch.density !== undefined)) {
      applyFromSettings({ ...settings, ...patch })
    }
    try {
      const updated = await patchSettings(patch)
      setSettings(updated)
      applyFromSettings(updated)
    } catch (e) {
      // Revert to pre-patch state on failure
      setSettings(prev)
      if (prev) applyFromSettings(prev)
      setError(e instanceof Error ? e.message : 'settings update failed')
    }
  }, [settings, applyFromSettings])

  return { settings, loading, error, update }
}
