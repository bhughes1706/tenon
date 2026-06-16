import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  MousePointer2, Plus, Ruler, Layers, AlertTriangle, List,
  Undo2, Redo2, Moon, Sun, Hammer, Search, Move3d, RotateCw,
} from 'lucide-react'
import type { Board } from '@tenon/core'
import { useAppCtx } from '../lib/AppContext.js'
import { useModelStore, type DesignerPanel } from '../lib/modelStore.js'
import { liveMembers } from '../lib/groups.js'
import { CommandPalette } from './CommandPalette.js'
import { Viewport } from '../viewport/Viewport.js'
import { Inspector } from './Inspector.js'
import { AddBoardDialog } from './AddBoardDialog.js'
import { ViewportContextMenu } from './ViewportContextMenu.js'

const SNAP_CYCLE: Array<0.0625 | 0.03125 | 0> = [0.0625, 0.03125, 0]
const SNAP_LABEL: Record<string, string> = { '0.0625': '1/16"', '0.03125': '1/32"', '0': 'off' }

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

function TopBtn({ onClick, title, active, disabled, children }: {
  onClick?: () => void; title?: string; active?: boolean; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      height: 26, padding: '0 var(--sp-2)',
      borderRadius: 'var(--radius-s)', border: 'none',
      background: 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, transition: `background var(--dur-fast) var(--ease-out)`,
    }}>
      {children}
    </button>
  )
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function DesignerShell() {
  const ctx = useAppCtx()
  const navigate = useNavigate()
  const { modelId } = useParams()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const model = useModelStore((s) => s.model)
  const loading = useModelStore((s) => s.loading)
  const error = useModelStore((s) => s.error)
  const toast = useModelStore((s) => s.toast)
  const mode = useModelStore((s) => s.mode)
  const gizmoMode = useModelStore((s) => s.gizmoMode)
  const panel = useModelStore((s) => s.panel)
  const warnings = useModelStore((s) => s.warnings)
  const jointWarnings = useModelStore((s) => s.jointWarnings)
  const selection = useModelStore((s) => s.selection)
  const addDialogOpen = useModelStore((s) => s.addDialogOpen)
  const canUndo = useModelStore((s) => s.undoStack.length > 0)
  const canRedo = useModelStore((s) => s.redoStack.length > 0)
  const store = useModelStore.getState

  const isDark = ctx.settings?.theme === 'dark'
  const precision = ctx.settings?.fraction_precision ?? 16
  const shadows = ctx.settings?.viewport_shadows ?? true
  const snapGrid = ctx.settings?.snap_grid ?? 0.0625
  const lintCount = warnings.length + jointWarnings.length

  // Load model on mount / id change, then frame it.
  useEffect(() => {
    if (!modelId) return
    void useModelStore.getState().load(modelId).then(() => useModelStore.getState().requestView('iso'))
  }, [modelId])

  // Mirror the snap setting into the store (drives the transform gizmo).
  useEffect(() => {
    useModelStore.getState().setSnapGrid(snapGrid)
  }, [snapGrid])

  // Live updates from Claude / other sessions (§3.3).
  useEffect(() => useModelStore.getState().connectEvents(), [])

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => useModelStore.getState().dismissToast(), 4000)
    return () => clearTimeout(id)
  }, [toast])

  // Keyboard shortcuts (§19.2). Suppressed while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = useModelStore.getState()
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) void s.redo()
        else void s.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        void s.redo()
        return
      }
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        void s.duplicateSelected()
        return
      }
      if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        void s.groupSelected()
        return
      }
      if (meta) return // leave other browser/system combos alone
      switch (e.key) {
        case 'v': case 'V': s.setMode('select'); break
        case 'b': case 'B': s.openAddDialog(); break
        case 'm': case 'M': s.setMode('measure'); break
        case 'g': case 'G': s.setGizmoMode('translate'); break
        case 'r': case 'R': s.setGizmoMode('rotate'); break
        case 'Escape':
          if (s.mode !== 'select') s.setMode('select')
          else s.clearSelection()
          break
        case 'Delete': case 'Backspace':
          if (s.selection.length > 0) { e.preventDefault(); void s.removeSelected() }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const togglePanel = (p: Exclude<DesignerPanel, null>) => store().togglePanel(p)
  const cycleSnap = () => {
    const idx = SNAP_CYCLE.findIndex((v) => v === snapGrid)
    ctx.updateSettings({ snap_grid: SNAP_CYCLE[(idx + 1) % SNAP_CYCLE.length] })
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: 'var(--topbar-height) 1fr var(--status-height)',
      gridTemplateColumns: 'var(--rail-width) 1fr var(--inspector-width)',
      height: '100dvh', overflow: 'hidden',
      background: 'var(--surface)', color: 'var(--text)',
    }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1', display: 'flex', alignItems: 'center',
        padding: '0 var(--sp-3)', gap: 'var(--sp-1)',
        background: 'var(--surface-raised)', borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={() => navigate('/models')} style={{
          fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text)',
          display: 'flex', alignItems: 'center', gap: 4, padding: '0 var(--sp-2)', height: 26,
          borderRadius: 'var(--radius-s)', border: 'none', background: 'transparent', cursor: 'pointer',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          ◧ <span>{model?.name ?? 'Model'}</span>
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn title="Undo (⌘Z)" disabled={!canUndo} onClick={() => void store().undo()}><Undo2 size={14} /></TopBtn>
        <TopBtn title="Redo (⌘⇧Z)" disabled={!canRedo} onClick={() => void store().redo()}><Redo2 size={14} /></TopBtn>
        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn title="Isometric" onClick={() => store().requestView('iso')}><span style={{ fontSize: 12 }}>iso</span></TopBtn>
        <TopBtn title="Top" onClick={() => store().requestView('top')}><span style={{ fontSize: 12 }}>↑</span></TopBtn>
        <TopBtn title="Front" onClick={() => store().requestView('front')}><span style={{ fontSize: 12 }}>→</span></TopBtn>
        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn title="Move gizmo (G)" active={gizmoMode === 'translate'} onClick={() => store().setGizmoMode('translate')}><Move3d size={14} /></TopBtn>
        <TopBtn title="Rotate gizmo (R)" active={gizmoMode === 'rotate'} onClick={() => store().setGizmoMode('rotate')}><RotateCw size={14} /></TopBtn>

        <div style={{ flex: 1 }} />

        <button onClick={() => setPaletteOpen(true)} style={{
          height: 26, padding: '0 var(--sp-3)', borderRadius: 'var(--radius-s)',
          border: '1px solid var(--border-strong)', background: 'var(--surface-sunken)',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)',
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 160, fontFamily: 'inherit',
        }}>
          <Search size={12} />
          <span>Search commands…</span>
          <kbd style={{
            marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
            background: 'var(--border)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace',
          }}>⌘K</kbd>
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-strong)', margin: '0 2px' }} />
        <TopBtn title="Toggle shop mode"
          onClick={() => ctx.updateSettings({ density: ctx.settings?.density === 'shop' ? 'comfortable' : 'shop' })}>
          <Hammer size={14} color={ctx.settings?.density === 'shop' ? 'var(--accent)' : undefined} />
        </TopBtn>
        <TopBtn title="Toggle theme" onClick={() => ctx.updateSettings({ theme: isDark ? 'light' : 'dark' })}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </TopBtn>
      </div>

      {/* ── Left rail ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'var(--sp-2) 0', gap: 2,
        background: 'var(--surface-raised)', borderRight: '1px solid var(--border)',
      }}>
        <RailBtn active={mode === 'select'} onClick={() => store().setMode('select')} title="Select (V)"><MousePointer2 size={14} /></RailBtn>
        <RailBtn active={mode === 'add'} onClick={() => store().openAddDialog()} title="Add board (B)"><Plus size={14} /></RailBtn>
        <RailBtn active={mode === 'measure'} onClick={() => store().setMode('measure')} title="Measure (M)"><Ruler size={14} /></RailBtn>

        <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '4px 0' }} />

        <RailBtn active={panel === 'outliner'} onClick={() => togglePanel('outliner')} title="Outliner"><Layers size={14} /></RailBtn>
        <RailBtn active={panel === 'lint'} onClick={() => togglePanel('lint')} title="Lint">
          <AlertTriangle size={14} />
          {lintCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2, background: 'var(--warn)', color: '#fff',
              fontSize: 9, minWidth: 14, height: 14, borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', fontWeight: 700,
            }}>{lintCount}</span>
          )}
        </RailBtn>
        <RailBtn active={panel === 'cutlist'} onClick={() => togglePanel('cutlist')} title="Cut list"><List size={14} /></RailBtn>
      </div>

      {/* ── Viewport ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--vp-bg)' }}>
        <ViewportContextMenu ctx={ctx}>
          <Viewport precision={precision} shadows={shadows} />
        </ViewportContextMenu>

        {/* Left overlay drawer */}
        {panel && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 252,
            background: 'var(--surface-raised)', borderRight: '1px solid var(--border-strong)',
            zIndex: 10, display: 'flex', flexDirection: 'column', boxShadow: '4px 0 16px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 var(--sp-3)', borderBottom: '1px solid var(--border)',
              fontSize: 'var(--text-sm)', fontWeight: 600, height: 36, flexShrink: 0,
            }}>
              <span>{{ outliner: 'Outliner', lint: 'Lint', cutlist: 'Cut List' }[panel]}</span>
              <button onClick={() => store().setPanel(null)} style={{
                width: 20, height: 20, border: 'none', background: 'transparent',
                color: 'var(--text-faint)', cursor: 'pointer', borderRadius: 'var(--radius-s)', fontSize: 13,
              }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--sp-2)' }}>
              {panel === 'outliner' && <Outliner />}
              {panel === 'lint' && <LintList />}
              {panel === 'cutlist' && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', padding: 'var(--sp-2)' }}>
                  Cut list appears here in chunk 15
                </span>
              )}
            </div>
          </div>
        )}

        {/* Mode hint + loading/error overlays */}
        <div style={{
          position: 'absolute', left: 'var(--sp-3)', bottom: 'var(--sp-3)',
          fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'monospace',
          background: 'var(--surface-overlay)', borderRadius: 'var(--radius-s)',
          padding: '2px 6px', border: '1px solid var(--border)', pointerEvents: 'none',
        }}>
          {mode === 'add' ? 'add' : mode}{mode === 'measure' ? ' · click two points' : ''}
        </div>

        {loading && <CenterNote>Loading model…</CenterNote>}
        {!loading && error && <CenterNote danger>{error}</CenterNote>}

        {toast && (
          <div style={{
            position: 'absolute', bottom: 'var(--sp-3)', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-overlay)', color: 'var(--text)',
            border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-m)',
            padding: 'var(--sp-2) var(--sp-4)', fontSize: 'var(--text-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 20,
          }}>{toast}</div>
        )}
      </div>

      {/* ── Inspector ────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-raised)', borderLeft: '1px solid var(--border)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        <Inspector precision={precision} />
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1', display: 'flex', alignItems: 'center',
        padding: '0 var(--sp-3)', gap: 'var(--sp-4)',
        background: 'var(--surface-raised)', borderTop: '1px solid var(--border)',
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)',
      }}>
        <button onClick={cycleSnap} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px var(--sp-2)',
          borderRadius: 'var(--radius-s)', border: '1px solid var(--border)', cursor: 'pointer',
          fontSize: 'var(--text-xs)', background: 'var(--surface-sunken)', color: 'var(--text-muted)',
        }}>⊡ snap {SNAP_LABEL[String(snapGrid)] ?? 'off'}</button>
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span>{model?.boards.length ?? 0} boards</span>
        <span>{model?.joints.length ?? 0} joints</span>
        {selection.length > 0 && <span style={{ color: 'var(--accent)' }}>{selection.length} selected</span>}
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span onClick={() => togglePanel('lint')} style={{ cursor: 'pointer', color: lintCount > 0 ? 'var(--warn)' : 'var(--text-faint)' }}>
          {lintCount > 0 ? `⚠ ${lintCount} warnings` : '✓ no lint'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-faint)' }}>rev {model?.rev ?? 0}</span>
      </div>

      <AddBoardDialog
        open={addDialogOpen}
        onClose={() => store().closeAddDialog()}
        defaultSpecies={ctx.settings?.default_species ?? 'spc_red_oak'}
        precision={precision}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={ctx} />
    </div>
  )
}

function CenterNote({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <span style={{
        fontSize: 'var(--text-sm)', color: danger ? 'var(--danger)' : 'var(--text-faint)',
        background: 'var(--surface-overlay)', borderRadius: 'var(--radius-m)',
        padding: 'var(--sp-2) var(--sp-4)', border: '1px solid var(--border)',
      }}>{children}</span>
    </div>
  )
}

function BoardRow({ board, selected, indent, onClick }: {
  board: Board; selected: boolean; indent?: boolean; onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%',
      background: selected ? 'var(--accent-subtle)' : 'transparent',
      color: selected ? 'var(--accent)' : 'var(--text)',
      padding: '4px var(--sp-2)', paddingLeft: indent ? 'var(--sp-5)' : 'var(--sp-2)',
      borderRadius: 'var(--radius-s)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
      display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</span>
      <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{board.kind}</span>
    </button>
  )
}

// §19.3 — boards/groups tree. Groups are a selection/organization convenience
// (no geometric meaning); selecting a group selects its members. Create from a
// ≥2-board selection; dissolve via the group row's ungroup button.
function Outliner() {
  const model = useModelStore((s) => s.model)
  const selection = useModelStore((s) => s.selection)
  const toggle = useModelStore((s) => s.toggleSelection)
  const setSelection = useModelStore((s) => s.setSelection)
  const groupSelected = useModelStore((s) => s.groupSelected)
  const ungroup = useModelStore((s) => s.ungroup)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (!model || model.boards.length === 0) {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', padding: 'var(--sp-2)' }}>No boards yet — press B to add one.</span>
  }

  const boardById = new Map(model.boards.map((b) => [b.id, b]))
  const grouped = new Set(model.groups.flatMap((g) => g.members))
  const ungroupedBoards = model.boards.filter((b) => !grouped.has(b.id))
  const rowClick = (id: string) => (e: React.MouseEvent) => toggle(id, e.shiftKey || e.metaKey || e.ctrlKey)
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {selection.length >= 2 && (
        <button onClick={() => void groupSelected()} style={{
          textAlign: 'left', border: '1px solid var(--border)', cursor: 'pointer',
          background: 'var(--surface-sunken)', color: 'var(--text-muted)',
          padding: '4px var(--sp-2)', borderRadius: 'var(--radius-s)', marginBottom: 2,
          fontSize: 'var(--text-xs)', fontFamily: 'inherit',
        }}>＋ Group {selection.length} boards (⌘G)</button>
      )}

      {model.groups.map((g) => {
        const members = liveMembers(model, g).map((id) => boardById.get(id)).filter((b): b is Board => !!b)
        const allSel = members.length > 0 && members.every((b) => selection.includes(b.id))
        const isCollapsed = collapsed.has(g.id)
        return (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => toggleCollapse(g.id)} title={isCollapsed ? 'Expand' : 'Collapse'} style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-faint)', width: 16, fontSize: 10, padding: 0,
              }}>{isCollapsed ? '▸' : '▾'}</button>
              <button onClick={(e) => setSelection(
                e.shiftKey || e.metaKey || e.ctrlKey
                  ? [...new Set([...selection, ...members.map((b) => b.id)])]
                  : members.map((b) => b.id),
              )} style={{
                flex: 1, textAlign: 'left', border: 'none', cursor: 'pointer',
                background: allSel ? 'var(--accent-subtle)' : 'transparent',
                color: allSel ? 'var(--accent)' : 'var(--text)',
                padding: '4px var(--sp-2)', borderRadius: 'var(--radius-s)',
                fontSize: 'var(--text-sm)', fontFamily: 'inherit', fontWeight: 600,
                display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)', overflow: 'hidden',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.name || 'Group'}
                </span>
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>{members.length}</span>
              </button>
              <button onClick={() => void ungroup(g.id)} title="Ungroup" style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-faint)', width: 20, fontSize: 13, padding: 0,
              }}>⊟</button>
            </div>
            {!isCollapsed && members.map((b) => (
              <BoardRow key={b.id} board={b} indent selected={selection.includes(b.id)} onClick={rowClick(b.id)} />
            ))}
          </div>
        )
      })}

      {ungroupedBoards.map((b) => (
        <BoardRow key={b.id} board={b} selected={selection.includes(b.id)} onClick={rowClick(b.id)} />
      ))}
    </div>
  )
}

function LintList() {
  // Authoritative analytic lint (collision/precondition) + post-carve joint geometry lint.
  const warnings = useModelStore((s) => s.warnings)
  const jointWarnings = useModelStore((s) => s.jointWarnings)
  const all = [...warnings, ...jointWarnings]
  if (all.length === 0) {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', padding: 'var(--sp-2)' }}>✓ No unresolved collisions or joinery warnings.</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {all.map((w, i) => (
        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)', padding: '2px var(--sp-2)' }}>
          <b>{w.code}</b> — {w.msg}
        </div>
      ))}
    </div>
  )
}
