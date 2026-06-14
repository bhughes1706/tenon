import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import {
  createBrowserRouter, RouterProvider, Navigate, Outlet,
  useLocation, useNavigate,
} from 'react-router-dom'
import { AppContextProvider, useAppCtx } from './lib/AppContext.js'
import { CommandPalette } from './ui/CommandPalette.js'
import { JobsBoard } from './pages/JobsBoard.js'
import { JobDetail } from './pages/JobDetail.js'
import { ModelsPage } from './pages/ModelsPage.js'
import { SettingsPage } from './pages/SettingsPage.js'
import { PhoneTabBar } from './ui/PhoneTabBar.js'

// The designer pulls in three.js / R3F (~1 MB). Lazy-load it so the jobs/photos
// PWA — the phase-1 survival product — stays lean on phone and shop PC.
const DesignerPage = lazy(() =>
  import('./pages/DesignerPage.js').then((m) => ({ default: m.DesignerPage })),
)

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

// Simple topbar for jobs/models/settings routes on desktop
function AppTopbar() {
  const ctx = useAppCtx()
  const navigate = useNavigate()
  const location = useLocation()
  const isDark = ctx.settings?.theme === 'dark'

  const NAV = [
    { to: '/jobs',     label: 'Jobs' },
    { to: '/models',   label: 'Models' },
    { to: '/settings', label: 'Settings' },
  ]

  return (
    <div style={{
      height: 'var(--topbar-height)',
      display: 'flex', alignItems: 'center',
      padding: '0 var(--sp-4)', gap: 'var(--sp-1)',
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--accent)', marginRight: 'var(--sp-2)' }}>
        Tenon
      </span>
      {NAV.map(({ to, label }) => {
        const active = location.pathname === to || location.pathname.startsWith(`${to}/`)
        return (
          <button key={to} onClick={() => navigate(to)} style={{
            height: 26, padding: '0 var(--sp-3)',
            borderRadius: 'var(--radius-s)', border: 'none',
            background: active ? 'var(--accent-subtle)' : 'transparent',
            color: active ? 'var(--accent)' : 'var(--text-muted)',
            fontWeight: active ? 600 : 400, cursor: 'pointer',
            fontSize: 'var(--text-sm)', fontFamily: 'inherit',
            transition: `background var(--dur-fast) var(--ease-out)`,
          }}>{label}</button>
        )
      })}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => ctx.updateSettings({ theme: isDark ? 'light' : 'dark' })}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1 }}
        title="Toggle theme"
      >{isDark ? '☀' : '☾'}</button>
    </div>
  )
}

// Root layout — provides AppCtx, palette, shell selection
function Root() {
  const ctx = useAppCtx()
  const location = useLocation()
  const isMobile = useIsMobile()
  const isDesigner = location.pathname.startsWith('/designer')
  const [paletteOpen, setPaletteOpen] = useState(false)

  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setPaletteOpen(v => !v)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Designer route manages its own chrome (topbar/rail/inspector/statusbar/palette).
  if (isDesigner) {
    return <Outlet />
  }

  // Phone: bottom tab bar wraps all routes
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)' }}>
          <Outlet />
        </div>
        <PhoneTabBar />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={ctx} />
      </div>
    )
  }

  // Desktop: topbar + content area
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--surface)' }}>
      <AppTopbar />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={ctx} />
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <AppContextProvider />,
    children: [
      {
        element: <Root />,
        children: [
          { index: true, element: <Navigate to="/jobs" replace /> },
          { path: '/jobs',              element: <JobsBoard /> },
          { path: '/jobs/:id',          element: <JobDetail /> },
          { path: '/models',            element: <ModelsPage /> },
          { path: '/settings',          element: <SettingsPage /> },
          {
            path: '/designer/:modelId',
            element: (
              <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--text-faint)', fontSize: 'var(--text-sm)', background: 'var(--vp-bg)' }}>
                  Loading designer…
                </div>
              }>
                <DesignerPage />
              </Suspense>
            ),
          },
          // Phone-only capture tab stub
          { path: '/capture',           element: (
            <div style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
              Camera capture — chunk 12
            </div>
          )},
        ],
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
