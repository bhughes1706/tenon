import * as ContextMenu from '@radix-ui/react-context-menu'
import { registry, type AppCtx } from '../lib/registry.js'
import { useModelStore } from '../lib/modelStore.js'

// §19.3 — the right-click menu is a renderer over registry.forContext(target, ctx).
// `menuTarget` is set on right-button pointerdown by the Viewport (board/multi) or
// onPointerMissed (empty), just before the native contextmenu opens this menu.

const contentStyle: React.CSSProperties = {
  minWidth: 180,
  background: 'var(--surface-overlay)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-m)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  padding: 'var(--sp-1)',
  zIndex: 50,
  fontSize: 'var(--text-sm)',
  color: 'var(--text)',
}

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)',
  padding: '5px var(--sp-2)', cursor: 'pointer', userSelect: 'none',
}

const shortcutStyle: React.CSSProperties = {
  color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontFamily: 'monospace',
}

export function ViewportContextMenu({ ctx, children }: { ctx: AppCtx; children: React.ReactNode }) {
  const menuTarget = useModelStore((s) => s.menuTarget)
  const items = menuTarget ? registry.forContext(menuTarget, ctx) : []
  const viewItems = items.filter((c) => c.group === 'View')
  const mainItems = items.filter((c) => c.group !== 'View')
  const run = (id: string) => registry.execute(id, ctx)

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content style={contentStyle} collisionPadding={8}>
          {mainItems.map((c) => (
            <ContextMenu.Item key={c.id} className="ctx-item" style={itemStyle} onSelect={() => run(c.id)}>
              <span>{c.label}</span>
              {c.shortcut && <span style={shortcutStyle}>{c.shortcut}</span>}
            </ContextMenu.Item>
          ))}

          {viewItems.length > 0 && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="ctx-item" style={itemStyle}>
                <span>View</span>
                <span style={shortcutStyle}>▸</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent style={contentStyle} sideOffset={2}>
                  {viewItems.map((c) => (
                    <ContextMenu.Item key={c.id} className="ctx-item" style={itemStyle} onSelect={() => run(c.id)}>
                      <span>{c.label}</span>
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}

          {items.length === 0 && (
            <div style={{ ...itemStyle, color: 'var(--text-faint)', cursor: 'default' }}>No actions</div>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
