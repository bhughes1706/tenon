import { useState, useEffect, useRef, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, X } from 'lucide-react'
import { registry } from '../lib/registry.js'
import type { AppCtx, Command } from '../lib/registry.js'

interface Props {
  open: boolean
  onClose: () => void
  ctx: AppCtx
}

export function CommandPalette({ open, onClose, ctx }: Props) {
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = registry.filtered(ctx, query)
  const groups = [...new Set(results.map(c => c.group ?? 'Commands'))]

  const run = useCallback((cmd: Command) => {
    onClose()
    setQuery('')
    cmd.run(ctx)
  }, [onClose, ctx])

  // Reset highlight when query changes
  useEffect(() => { setHi(0) }, [query])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
      if (e.key === 'Enter' && results[hi]) run(results[hi])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, hi, run])

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-hi="true"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) { onClose(); setQuery('') } }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 200,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 80,
        }}>
          <Dialog.Content
            style={{
              width: 540, maxHeight: 420,
              background: 'var(--surface-overlay)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-l)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}
            aria-label="Command palette"
            onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus() }}
          >
            {/* Search input */}
            <div style={{
              display: 'flex', alignItems: 'center',
              padding: '0 var(--sp-4)',
              borderBottom: '1px solid var(--border)',
              height: 48, gap: 'var(--sp-2)',
            }}>
              <Search size={15} color="var(--text-faint)" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search commands…"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 'var(--text-md)', color: 'var(--text)', fontFamily: 'inherit',
                }}
              />
              <kbd style={{
                fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
                background: 'var(--border)', padding: '2px 6px',
                borderRadius: 3, fontFamily: 'monospace',
              }}>esc</kbd>
            </div>

            {/* Results */}
            <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
              {results.length === 0 && (
                <div style={{ padding: 'var(--sp-6) var(--sp-4)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                  No commands match "{query}"
                </div>
              )}
              {groups.map(grp => {
                const cmds = results.filter(c => (c.group ?? 'Commands') === grp)
                return (
                  <div key={grp}>
                    <div style={{
                      padding: 'var(--sp-2) var(--sp-4) 4px',
                      fontSize: 'var(--text-xs)', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-faint)',
                    }}>{grp}</div>
                    {cmds.map(cmd => {
                      const idx = results.indexOf(cmd)
                      const isHi = idx === hi
                      return (
                        <div
                          key={cmd.id}
                          data-hi={isHi}
                          onMouseEnter={() => setHi(idx)}
                          onClick={() => run(cmd)}
                          style={{
                            display: 'flex', alignItems: 'center',
                            padding: '0 var(--sp-4)', height: 40,
                            gap: 'var(--sp-3)', cursor: 'pointer',
                            fontSize: 'var(--text-sm)',
                            background: isHi ? 'var(--accent-subtle)' : 'transparent',
                          }}
                        >
                          <span style={{ width: 18, fontSize: 13, color: 'var(--text-muted)' }}>
                            {cmd.icon && <CmdIcon name={cmd.icon} />}
                          </span>
                          <span style={{ flex: 1, color: 'var(--text)' }}>{cmd.label}</span>
                          {cmd.shortcut && (
                            <span style={{
                              fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
                              background: 'var(--surface-sunken)', padding: '2px 6px',
                              borderRadius: 3, fontFamily: 'monospace',
                            }}>{cmd.shortcut}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            <Dialog.Close asChild>
              <button
                style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 24, height: 24, border: 'none', background: 'transparent',
                  color: 'var(--text-faint)', cursor: 'pointer', borderRadius: 'var(--radius-s)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Lazy lucide icon by name — avoids importing every icon at the top level
function CmdIcon({ name }: { name: string }) {
  // Common icons used in commands; extend as needed
  const icons: Record<string, React.ReactNode> = {
    Briefcase: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
    Box: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    Settings: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
    Plus: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    Moon: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    Sun: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    Hammer: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c.16-.51.16-1.07 0-1.58l1.25-1.25a2 2 0 0 0 0-2.83l-1.25-1.25c-.49-.49-1.14-.77-1.82-.77H16c-.68 0-1.33.28-1.82.77L3 14.27a2 2 0 0 0 0 2.83l1.25 1.25c.49.49 1.14.77 1.82.77H8c.68 0 1.33-.28 1.82-.77l7.09-7.09"/></svg>,
    MousePointer2: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/></svg>,
    Ruler: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>,
    Undo2: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>,
    Redo2: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>,
    Layers: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>,
    AlertTriangle: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    List: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    Link: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    Square: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
    Focus: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>,
    Highlighter: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>,
    Boxes: <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
  }
  return <>{icons[name] ?? null}</>
}
