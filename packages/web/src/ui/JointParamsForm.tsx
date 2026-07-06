import { formatInches, parseInches } from '../lib/fraction.js'
import type { JointType } from '@tenon/core'

// Shared per-type joint param form (chunk 11) — rendered by BOTH the JointDialog
// (params accumulate in local state until Add) and the JointInspector (each commit
// dispatches update_joint). Only params the chunk-9 JointFns actually consume are
// shown; deferred ones (M&T haunch/wedged/drawbore/twin, housing shoulder) would
// only warn JOINT_FEATURE_UNIMPLEMENTED, so they're omitted until they carve.
//
// Optional numeric params show their geometry-derived default as a placeholder.
// Known v1 limitation: once set, a param can't return to "auto" — update_joint
// patches merge, so a key can't be deleted (delete + recreate the joint instead).

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }
const labelStyle: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 92, flexShrink: 0 }
const inputStyle: React.CSSProperties = {
  width: 64, background: 'var(--surface-sunken)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-s)', padding: '3px var(--sp-2)', fontSize: 'var(--text-sm)',
  color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
}
const selectStyle: React.CSSProperties = { ...inputStyle, width: undefined, flex: 1 }

function Row({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle} title={title}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
}

// Optional fractional-inch input: empty shows the auto default as placeholder. A
// blank/invalid commit reverts (it cannot clear an already-set param — see above).
// allowZero: shoulders accept 0 (= full-width tenon); depths/widths must be positive.
function OptInch({ value, placeholder, precision, onSet, allowZero = false }: {
  value: number | undefined; placeholder: string; precision: number; onSet: (v: number) => void; allowZero?: boolean
}) {
  const display = value !== undefined ? formatInches(value, precision) : ''
  return (
    <input
      type="text"
      inputMode="text"
      key={display} // re-sync from params on external change (undo etc.)
      defaultValue={display}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        e.stopPropagation()
      }}
      onBlur={(e) => {
        const n = parseInches(e.target.value)
        if (n !== null && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n !== value) onSet(n)
        else e.target.value = display
      }}
      style={inputStyle}
    />
  )
}

// Plain bounded number input (fractions-of-dimension params, fastener count).
function NumInput({ value, onSet, min = 0.05, max = 0.95, step = 0.05 }: {
  value: number; onSet: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <input
      type="number"
      key={value}
      defaultValue={value}
      min={min} max={max} step={step}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        e.stopPropagation()
      }}
      onBlur={(e) => {
        const n = parseFloat(e.target.value)
        if (Number.isFinite(n) && n >= min && n <= max && n !== value) onSet(n)
        else e.target.value = String(value)
      }}
      style={inputStyle}
    />
  )
}

function Check({ checked, onSet }: { checked: boolean; onSet: (v: boolean) => void }) {
  return (
    <input type="checkbox" checked={checked} onChange={(e) => onSet(e.target.checked)}
      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
  )
}

const num = (p: Record<string, unknown>, k: string): number | undefined =>
  typeof p[k] === 'number' ? (p[k] as number) : undefined
const bool = (p: Record<string, unknown>, k: string, fallback: boolean): boolean =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : fallback
const str = (p: Record<string, unknown>, k: string): string | undefined =>
  typeof p[k] === 'string' ? (p[k] as string) : undefined

export function JointParamsForm({ type, params, precision, onPatch }: {
  type: JointType
  params: Record<string, unknown>
  precision: number
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const set = (k: string) => (v: unknown) => onPatch({ [k]: v })

  switch (type) {
    case 'butt':
      // No carve params — fastener info feeds the cut list's machining notes (§7).
      return (
        <>
          <Row label="Fastener">
            <select value={str(params, 'fastener') ?? 'none'} onChange={(e) => set('fastener')(e.target.value)} style={selectStyle}>
              {['none', 'screw', 'dowel', 'domino', 'pocket_screw'].map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </select>
          </Row>
          {str(params, 'fastener') !== undefined && str(params, 'fastener') !== 'none' && (
            <>
              <Row label="Count" title="Auto: 1 per 3&quot; of joint width, min 2">
                <NumInput value={num(params, 'count') ?? 2} min={1} max={99} step={1} onSet={(v) => set('count')(Math.round(v))} />
              </Row>
              <Row label="Dia">
                <OptInch value={num(params, 'dia')} placeholder={'3/8"'} precision={precision} onSet={set('dia')} />
              </Row>
            </>
          )}
        </>
      )

    case 'rabbet':
      return (
        <>
          <Row label="Depth" title="Into a's face. Auto: half of a's thickness">
            <OptInch value={num(params, 'depth')} placeholder="auto: tₐ/2" precision={precision} onSet={set('depth')} />
          </Row>
          <Row label="Width" title="Along the mating edge. Auto: b's thickness">
            <OptInch value={num(params, 'width')} placeholder="auto: t_b" precision={precision} onSet={set('width')} />
          </Row>
        </>
      )

    case 'housing':
      return (
        <>
          <Row label="Depth" title="Dado depth into a. Auto: a third of a's thickness">
            <OptInch value={num(params, 'depth')} placeholder="auto: tₐ/3" precision={precision} onSet={set('depth')} />
          </Row>
          <Row label="Fit gap" title="Extra width so the shelf slides in (0 = cut to fit)">
            <OptInch value={num(params, 'fit_allowance')} placeholder={'0"'} precision={precision} onSet={set('fit_allowance')} />
          </Row>
          <Row label="Stopped" title="Stop the dado short of the front edge">
            <Check checked={bool(params, 'stopped', false)} onSet={set('stopped')} />
          </Row>
          {bool(params, 'stopped', false) && (
            <Row label="Stop offset">
              <OptInch value={num(params, 'stop_offset')} placeholder={'3/4"'} precision={precision} onSet={set('stop_offset')} />
            </Row>
          )}
        </>
      )

    case 'half_lap':
      return (
        <>
          <Row label="Split" title="Fraction of the overlap height removed from a (0.5 = even)">
            <NumInput value={num(params, 'split') ?? 0.5} onSet={set('split')} />
          </Row>
          <Row label="On top" title="Which board keeps its top face. Auto: derived from world height">
            <select value={str(params, 'on_top') ?? ''} onChange={(e) => set('on_top')(e.target.value || undefined)} style={selectStyle}>
              <option value="">auto</option>
              <option value="a">a</option>
              <option value="b">b</option>
            </select>
          </Row>
        </>
      )

    case 'bridle':
      return (
        <>
          <Row label="Tenon" title="Tenon thickness as a fraction of the slotted board">
            <NumInput value={num(params, 'tenon_fraction') ?? 1 / 3} onSet={set('tenon_fraction')} />
          </Row>
          <Row label="Snap to tool" title="Round tenon thickness to the nearest 1/8&quot;">
            <Check checked={bool(params, 'snap_to_tool', true)} onSet={set('snap_to_tool')} />
          </Row>
        </>
      )

    case 'mortise_tenon':
      return (
        <>
          <Row label="Thickness" title="Tenon thickness as a fraction of b's thickness (rule of thirds)">
            <NumInput value={num(params, 'thickness_fraction') ?? 1 / 3} onSet={set('thickness_fraction')} />
          </Row>
          <Row label="…or exact" title="Absolute tenon thickness — overrides the fraction">
            <OptInch value={num(params, 'thickness')} placeholder="fraction" precision={precision} onSet={set('thickness')} />
          </Row>
          <Row label="Snap to tool" title="Round thickness to the nearest 1/16&quot; (chisel sizes)">
            <Check checked={bool(params, 'snap_to_tool', true)} onSet={set('snap_to_tool')} />
          </Row>
          <Row label="Through" title="Auto: through when the tenon reaches a's far face">
            <select
              value={typeof params.through === 'boolean' ? String(params.through) : ''}
              onChange={(e) => set('through')(e.target.value === '' ? undefined : e.target.value === 'true')}
              style={selectStyle}
            >
              <option value="">auto</option>
              <option value="true">through</option>
              <option value="false">blind</option>
            </select>
          </Row>
          <Row label="Depth" title="Tenon length into a. Auto: full engagement (blind caps at tₐ−1/4)">
            <OptInch value={num(params, 'depth')} placeholder="auto" precision={precision} onSet={set('depth')} />
          </Row>
          <Row label="Shoulders" title="Top / bottom shoulders along b's width (0 = full-width tenon)">
            <OptInch
              value={Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[])[0] : undefined}
              placeholder={'3/8"'} precision={precision} allowZero
              onSet={(v) => {
                const cur = Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[]) : [3 / 8, 3 / 8]
                set('width_shoulders')([v, cur[1]])
              }}
            />
            <OptInch
              value={Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[])[1] : undefined}
              placeholder={'3/8"'} precision={precision} allowZero
              onSet={(v) => {
                const cur = Array.isArray(params.width_shoulders) ? (params.width_shoulders as number[]) : [3 / 8, 3 / 8]
                set('width_shoulders')([cur[0], v])
              }}
            />
          </Row>
        </>
      )

    // Deferred types never reach the form (the dialog disables them; existing docs
    // can't contain them yet) — but stay total.
    default:
      return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>No editable parameters.</span>
  }
}
