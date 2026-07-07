import { forwardRef, useRef, type CSSProperties, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

// The thin shared component set (§20.4). Every control references Layer 2
// semantic tokens only; heights come from the Layer 3 density knobs, so shop
// mode (data-density="shop") bumps hit targets here without component changes.
//
// This is the design language in code form:
//   - controls are var(--btn-height-comfortable) tall (32px / 44px shop)
//   - text inputs & selects share one chrome (sunken surface, 1px border)
//   - form rows are label-left (fixed column) with var(--sp-2) gaps
//   - dialogs share overlay, panel chrome, header, and footer via DialogShell
// New UI should compose these instead of hand-rolling inline styles.

/* ── Control chrome ──────────────────────────────────────────────────────── */

const controlChrome: CSSProperties = {
  height: 'var(--btn-height-comfortable)',
  boxSizing: 'border-box',
  background: 'var(--surface-sunken)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-s)',
  padding: '0 var(--sp-2)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text)',
  fontFamily: 'inherit',
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ style, ...props }, ref) {
    return <input ref={ref} {...props} style={{ ...controlChrome, ...style }} />
  },
)

// Numeric-looking text (fractional inches, degrees, counts) aligns in columns.
export const NumChrome: CSSProperties = { ...controlChrome, fontVariantNumeric: 'tabular-nums' }

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return <select ref={ref} {...props} style={{ ...controlChrome, cursor: 'pointer', ...style }} />
  },
)

export function Checkbox({ checked, onSet, disabled }: {
  checked: boolean
  onSet: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onSet(e.target.checked)}
      style={{ accentColor: 'var(--accent)', cursor: disabled ? 'default' : 'pointer', width: 15, height: 15 }}
    />
  )
}

// Compact labelled slider for viewport overlays (explode / isolate) — used by
// both the main viewport and the joint dialog's mini-viewport.
export function ViewSlider({ label, value, active, muted, title, onChange }: {
  label: string; value: number; active: boolean; muted?: boolean; title: string
  onChange: (v: number) => void
}) {
  const color = muted ? 'var(--text-faint)' : active ? 'var(--accent)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', color }} title={title}>
      <span style={{ fontFamily: 'monospace', width: 52 }}>{label}</span>
      <input
        type="range" min={0} max={1} step={0.02} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 96, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
    </div>
  )
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const buttonBase: CSSProperties = {
  height: 'var(--btn-height-comfortable)',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--sp-1)',
  padding: '0 var(--sp-4)',
  borderRadius: 'var(--radius-s)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: `background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)`,
}

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { border: 'none', background: 'var(--accent)', color: 'var(--text-on-accent)', fontWeight: 600 },
  secondary: { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)' },
  ghost: { border: 'none', background: 'transparent', color: 'var(--text-muted)' },
}

export function Button({ variant = 'secondary', style, disabled, ...props }: {
  variant?: ButtonVariant
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      {...props}
      style={{
        ...buttonBase,
        ...buttonVariants[variant],
        ...(disabled && { opacity: 0.5, cursor: 'default' }),
        ...style,
      }}
    />
  )
}

// Selectable chip — compact toggle used for pickers (joint type, view presets).
// Disabled chips stay hoverable so their title= tooltip can teach why (§13).
export function Chip({ selected, disabled, strike, style, ...props }: {
  selected?: boolean
  strike?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      {...props}
      style={{
        boxSizing: 'border-box',
        minHeight: 28,
        padding: 'var(--sp-1) var(--sp-3)',
        borderRadius: 'var(--radius-s)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'var(--accent-subtle)' : 'var(--surface-sunken)',
        color: disabled ? 'var(--text-faint)' : selected ? 'var(--accent)' : 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 'var(--text-xs)',
        fontFamily: 'inherit',
        textDecoration: strike ? 'line-through' : undefined,
        transition: `border-color var(--dur-fast) var(--ease-out)`,
        ...style,
      }}
    />
  )
}

// Square hit target for icon-only actions (close, swap, …). Always give it an
// aria-label or title.
export function IconButton({ style, size = 28, ...props }: {
  size?: number
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: 'none',
        background: 'transparent',
        borderRadius: 'var(--radius-s)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        ...style,
      }}
    />
  )
}

/* ── Form rows ───────────────────────────────────────────────────────────── */

// Label-left form row. Fixed label column keeps controls aligned across rows;
// title= puts the teaching hint on both the label and the control area.
export function FormRow({ label, title, labelWidth = 96, children }: {
  label: string
  title?: string
  labelWidth?: number
  children: ReactNode
}) {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minHeight: 'var(--btn-height-comfortable)' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: labelWidth, flexShrink: 0 }}>
        {label}
      </span>
      {children}
    </div>
  )
}

// Status line under a control or preview: ok / warn / danger / faint.
export function Note({ tone = 'faint', children }: {
  tone?: 'ok' | 'warn' | 'danger' | 'faint'
  children: ReactNode
}) {
  const color = tone === 'faint' ? 'var(--text-faint)' : `var(--${tone})`
  return <div style={{ fontSize: 'var(--text-xs)', color, lineHeight: 1.5 }}>{children}</div>
}

/* ── Resizing ────────────────────────────────────────────────────────────── */

// Draggable divider — axis 'x' resizes a width (col-resize, vertical grip bar),
// axis 'y' resizes a height (row-resize, horizontal grip bar). Reports the
// pointer-move delta each frame; the caller folds it into whatever dimension
// it owns. Used for both panel widths (DesignerShell) and preview heights
// (JointDialog) so every drag handle in the app looks and behaves the same.
export function ResizeHandle({ axis, onDrag, title = 'Drag to resize', thickness = 14, style }: {
  axis: 'x' | 'y'
  onDrag: (delta: number) => void
  title?: string
  thickness?: number
  style?: CSSProperties
}) {
  const dragRef = useRef<number | null>(null)
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={title}
      title={title}
      onPointerDown={(e) => {
        dragRef.current = axis === 'x' ? e.clientX : e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (dragRef.current === null) return
        const pos = axis === 'x' ? e.clientX : e.clientY
        onDrag(pos - dragRef.current)
        dragRef.current = pos
      }}
      onPointerUp={() => { dragRef.current = null }}
      style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: axis === 'x' ? 'col-resize' : 'row-resize',
        touchAction: 'none',
        ...(axis === 'x' ? { width: thickness, height: '100%' } : { height: thickness, width: '100%' }),
        ...style,
      }}
    >
      <div style={
        axis === 'x'
          ? { width: 4, height: 40, borderRadius: 2, background: 'var(--border-strong)' }
          : { width: 40, height: 4, borderRadius: 2, background: 'var(--border-strong)' }
      } />
    </div>
  )
}

// Pixel dimension that persists across sessions (panel widths, preview
// heights). Reads its stored value lazily so the very first render already
// has the user's last size — no layout jump on mount.
export function loadPersistedSize(key: string, fallback: number, min: number, max: number): number {
  if (typeof localStorage === 'undefined') return fallback
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, min), max) : fallback
}

export function savePersistedSize(key: string, value: number): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, String(value))
}

/* ── Dialog shell ────────────────────────────────────────────────────────── */

// Shared Radix Dialog chrome: overlay, centered panel, titled header with a
// close button, sp-4 rhythm between children, right-aligned footer. Dialogs
// supply only their body (and footer buttons).
export function DialogShell({ open, onOpenChange, title, width = 400, top = '14%', footer, onKeyDown, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  width?: number | string
  top?: string
  footer?: ReactNode
  onKeyDown?: React.KeyboardEventHandler
  children: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
        <Dialog.Content
          aria-label={title}
          onKeyDown={onKeyDown}
          style={{
            position: 'fixed',
            top,
            left: '50%',
            transform: 'translateX(-50%)',
            width,
            maxWidth: '94vw',
            maxHeight: '86dvh',
            overflowY: 'auto',
            background: 'var(--surface-overlay)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-l)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            zIndex: 201,
            padding: 'var(--sp-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Dialog.Title style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton aria-label="Close" style={{ color: 'var(--text-faint)' }}>
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
          {footer && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' }}>
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
