import { createContext, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings.js'
import type { AppCtx } from './registry.js'

const Ctx = createContext<AppCtx | null>(null)

export function useAppCtx(): AppCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppCtx must be used inside AppContextProvider')
  return ctx
}

// Layout route: provides AppCtx to all children via context
export function AppContextProvider() {
  const navigate = useNavigate()
  const { settings, update } = useSettings()

  const ctx = useMemo<AppCtx>(() => ({
    navigate,
    settings,
    updateSettings: update,
  }), [navigate, settings, update])

  return (
    <Ctx.Provider value={ctx}>
      <Outlet />
    </Ctx.Provider>
  )
}
