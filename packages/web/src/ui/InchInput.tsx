import { useEffect, useState, type CSSProperties } from 'react'
import { formatInches, parseInches } from '../lib/fraction.js'

// Fractional-inch text input (§2.1). Displays the reduced fraction, parses
// 3/4 · 1-3/8 · 1.375 · 35mm on commit (blur / Enter). Rejects unparseable or
// out-of-range input by reverting to the last good value.
export function InchInput({
  value,
  onCommit,
  precision = 16,
  positive = false,
  disabled,
  style,
}: {
  value: number
  onCommit: (v: number) => void
  precision?: number
  positive?: boolean
  disabled?: boolean
  style?: CSSProperties
}) {
  const [text, setText] = useState(() => formatInches(value, precision))
  const [focused, setFocused] = useState(false)

  // Re-sync from the model when not actively editing.
  useEffect(() => {
    if (!focused) setText(formatInches(value, precision))
  }, [value, precision, focused])

  const commit = () => {
    const n = parseInches(text)
    const valid = n !== null && Number.isFinite(n) && (!positive || n > 0)
    if (valid && n !== value) onCommit(n)
    setText(formatInches(valid ? n! : value, precision))
  }

  return (
    <input
      type="text"
      inputMode="text"
      value={text}
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true)
        e.currentTarget.select()
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setText(formatInches(value, precision))
          e.currentTarget.blur()
        }
        e.stopPropagation() // keep viewport hotkeys (V/B/M…) from firing while typing
      }}
      style={{
        width: 64,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-s)',
        padding: '3px var(--sp-2)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'inherit',
        ...style,
      }}
    />
  )
}
