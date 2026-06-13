import { useState, useEffect, useCallback } from 'react'
import { type Settings, getSettings, patchSettings } from '../lib/api.js'
import { applyTheme, listenSystemTheme, persistThemeLocally } from '../lib/theme.js'

const LS_KEY = 'tenon:settings'

function readLocalSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {}
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

  // Apply theme + density whenever settings change
  const applyFromSettings = useCallback((s: Settings) => {
    applyTheme(s.theme, s.density)
    listenSystemTheme(s.theme, s.density)
    persistThemeLocally(s.theme, s.density)
    writeLocalSettings(s)
  }, [])

  useEffect(() => {
    // Seed state immediately from localStorage so UI renders with correct values
    const local = readLocalSettings()
    if (local.theme || local.density) {
      setSettings(prev => ({ ...(prev ?? {} as Settings), ...local }))
    }

    getSettings()
      .then(s => {
        setSettings(s)
        applyFromSettings(s)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'settings load failed'))
      .finally(() => setLoading(false))
  }, [applyFromSettings])

  const update = useCallback(async (patch: Partial<Settings>) => {
    // Optimistic update
    setSettings(prev => prev ? { ...prev, ...patch } : null)
    if (patch.theme || patch.density) {
      const current = settings ? { ...settings, ...patch } : patch as Settings
      applyFromSettings(current)
    }
    try {
      const updated = await patchSettings(patch)
      setSettings(updated)
      applyFromSettings(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'settings update failed')
    }
  }, [settings, applyFromSettings])

  return { settings, loading, error, update }
}
