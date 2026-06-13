import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import {
  MousePointer2, Plus, Ruler, Layers, AlertTriangle, List,
  Undo2, Redo2, Moon, Sun, Hammer, Search,
} from 'lucide-react'
import { useAppCtx } from '../lib/AppContext.js'
import { CommandPalette } from './CommandPalette.js'

type Mode = 'select' | 'add' | 'measure'
type Panel = 'outliner' | 'lint' | 'cutlist' | null

const LINT_COUNT = 0  // placeholder; chunk 7 feeds real warnings

function RailBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 'var(--btn-height-comfortable)',
      borderRadius: 'var(--radius-s)', border: 'none',
      background: active ? 'var(--accent-subtle)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', transition: `background var(--dur-fast) var(--ease-out)`,
    }}>
      {children}
    </button>
  )
}

function TopBtn({ onClick, title, active, children }: {
  onClick?: () => void; title?: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} style={{
      height: 26, padding: '0 var(--sp-2)',
      borderRadius: 'var(--radius-s)', border: 'none',
      background: 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, transition: `background var(--dur-fast) var(--ease-out)`,
    }}>
      {children}
    </button>
  )
}

export function DesignerShell() {
  const ctx = useAppCtx()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('select')
  const [panel, setPanel] = useState<Panel>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const isDark = ctx.settings?.theme === 'dark'

  const togglePanel = (p: Panel) => setPanel(prev => prev === p ? null : p)

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: 'var(--topbar-height) 1fr var(--status-height)',
      gridTemplateColumns: 'var(--rail-width) 1fr var(--inspector-width)',
      height: '100dvh',
      overflow: 'hidden',
      background: 'var(--surface)',
      color: 'var(--text)',
    }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex', alignItems: 'center',
        padding: '0 var(--sp-3)', gap: 'var(--sp-1)',
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => navigate('/models')}
          style={{
            fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 var(--sp-2)', height: 26,
            borderRadius: 'var(--radius-s)', border: 'none', background: 'transparent',
            cursor: 'pointer',
          }}
        >
          ◧ <span>Model</span>
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn title="Undo (⌘Z)"><Undo2 size={14} /></TopBtn>
        <TopBtn title="Redo (⌘⇧Z)"><Redo2 size={14} /></TopBtn>
        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn active><span style={{ fontSize: 12 }}>iso</span></TopBtn>
        <TopBtn><span style={{ fontSize: 12 }}>↑</span></TopBtn>
        <TopBtn><span style={{ fontSize: 12 }}>→</span></TopBtn>

        <div style={{ flex: 1 }} />

        {/* ⌘K pill */}
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            height: 26, padding: '0 var(--sp-3)',
            borderRadius: 'var(--radius-s)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-sunken)',
            color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            minWidth: 160, fontFamily: 'inherit',
          }}
        >
          <Search size={12} />
          <span>Search commands…</span>
          <kbd style={{
            marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
            background: 'var(--border)', padding: '1px 5px', borderRadius: 3,
            fontFamily: 'monospace',
          }}>⌘K</kbd>
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn
          title="Toggle shop mode"
          onClick={() => ctx.updateSettings({ density: ctx.settings?.density === 'shop' ? 'comfortable' : 'shop' })}
        >
          <Hammer size={14} color={ctx.settings?.density === 'shop' ? 'var(--accent)' : undefined} />
        </TopBtn>
        <TopBtn
          title="Toggle theme"
          onClick={() => ctx.updateSettings({ theme: isDark ? 'light' : 'dark' })}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </TopBtn>
      </div>

      {/* ── Left rail ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'var(--sp-2) 0', gap: 2,
        background: 'var(--surface-raised)',
        borderRight: '1px solid var(--border)',
      }}>
        <RailBtn active={mode === 'select'} onClick={() => setMode('select')} title="Select (V)">
          <MousePointer2 size={14} />
        </RailBtn>
        <RailBtn active={mode === 'add'} onClick={() => setMode('add')} title="Add board (B)">
          <Plus size={14} />
        </RailBtn>
        <RailBtn active={mode === 'measure'} onClick={() => setMode('measure')} title="Measure (M)">
          <Ruler size={14} />
        </RailBtn>

        <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '4px 0' }} />

        <RailBtn active={panel === 'outliner'} onClick={() => togglePanel('outliner')} title="Outliner">
          <Layers size={14} />
        </RailBtn>
        <RailBtn active={panel === 'lint'} onClick={() => togglePanel('lint')} title="Lint">
          <AlertTriangle size={14} />
          {LINT_COUNT > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2,
              background: 'var(--warn)', color: '#fff',
              fontSize: 9, minWidth: 14, height: 14,
              borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', fontWeight: 700,
            }}>{LINT_COUNT}</span>
          )}
        </RailBtn>
        <RailBtn active={panel === 'cutlist'} onClick={() => togglePanel('cutlist')} title="Cut list">
          <List size={14} />
        </RailBtn>
      </div>

      {/* ── Viewport ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--vp-bg)',
      }}>
        {/* Left overlay drawer */}
        {panel && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 252,
            background: 'var(--surface-raised)',
            borderRight: '1px solid var(--border-strong)',
            zIndex: 10, display: 'flex', flexDirection: 'column',
            boxShadow: '4px 0 16px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 var(--sp-3)', borderBottom: '1px solid var(--border)',
              fontSize: 'var(--text-sm)', fontWeight: 600, height: 36, flexShrink: 0,
            }}>
              <span>{{ outliner: 'Outliner', lint: 'Lint', cutlist: 'Cut List' }[panel]}</span>
              <button onClick={() => setPanel(null)} style={{
                width: 20, height: 20, border: 'none', background: 'transparent',
                color: 'var(--text-faint)', cursor: 'pointer',
                borderRadius: 'var(--radius-s)', fontSize: 13,
              }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--sp-4)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                {panel === 'outliner' && 'Boards appear here in chunk 7'}
                {panel === 'lint' && 'Lint warnings appear here in chunk 7'}
                {panel === 'cutlist' && 'Cut list appears here in chunk 9'}
              </span>
            </div>
          </div>
        )}

        {/* Viewport placeholder — chunk 7 replaces with R3F scene */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 'var(--sp-2)',
        }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            3D viewport — chunk 7
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
            mode: {mode}
          </span>
        </div>

        {/* Outlet lets nested routes render inside the viewport area */}
        <Outlet />
      </div>

      {/* ── Inspector ────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-raised)',
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            fontSize: 'var(--text-xs)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'var(--text-faint)', marginBottom: 'var(--sp-2)',
          }}>Inspector</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
            Select a board to inspect — chunk 7
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex', alignItems: 'center',
        padding: '0 var(--sp-3)', gap: 'var(--sp-4)',
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--border)',
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
      }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px var(--sp-2)', borderRadius: 'var(--radius-s)',
          border: '1px solid var(--border)', cursor: 'pointer',
          fontSize: 'var(--text-xs)', background: 'var(--surface-sunken)',
        }}>⊡ snap 1/16"</button>
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span>0 boards</span>
        <span>0 joints</span>
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span
          onClick={() => togglePanel('lint')}
          style={{ cursor: 'pointer', color: LINT_COUNT > 0 ? 'var(--warn)' : 'var(--text-faint)' }}
        >
          {LINT_COUNT > 0 ? `⚠ ${LINT_COUNT} warnings` : '✓ no lint'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-faint)' }}>rev 0</span>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={ctx} />
    </div>
  )
}
