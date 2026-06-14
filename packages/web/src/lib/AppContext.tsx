import { createContext, useContext, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings.js'
import { useModelStore } from './modelStore.js'
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
  // Designer state surfaced for command `when` predicates. Outside the designer
  // these stay constant ([], 'select', null), so non-designer pages don't churn.
  const selection = useModelStore((s) => s.selection)
  const mode = useModelStore((s) => s.mode)
  const scene = useModelStore((s) => s.scene)

  const ctx = useMemo<AppCtx>(() => ({
    navigate,
    settings,
    updateSettings: update,
    selection,
    mode,
    scene,
  }), [navigate, settings, update, selection, mode, scene])

  return (
    <Ctx.Provider value={ctx}>
      <Outlet />
    </Ctx.Provider>
  )
}
