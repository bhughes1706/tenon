// Router-mode bit-store panel (docs/chunk17-design.md §5). Shown while mode === 'router'.
// Pick a bit → it arms arris painting (click an arris in the viewport to route it). The
// bit store is the user's inventory: seeded, and add-only from here (PATCH edit is a
// follow-up, §8). Picking a bit only fills an edge profile's dimension fields — the store
// is inventory, not a live geometry dependency (§3.5).
import { useState } from 'react'
import { useModelStore } from '../lib/modelStore.js'
import { useBits, addBit, type Bit } from '../lib/bitsApi.js'
import { fmtFraction, makeEdgeProfileId } from '@tenon/core'

const PROFILES = ['roundover', 'chamfer', 'cove', 'ogee', 'rabbet'] as const

// A one-line dimension summary for a bit row.
function bitDims(b: Bit): string {
  switch (b.profile) {
    case 'roundover':
    case 'cove':
    case 'ogee':
      return b.radius != null ? `${fmtFraction(b.radius)}R` : ''
    case 'chamfer':
      return b.cut_width != null ? `${fmtFraction(b.cut_width)} · 45°` : ''
    case 'rabbet':
      return `${b.cut_width != null ? fmtFraction(b.cut_width) : '?'}${b.cut_depth != null ? ` × ${fmtFraction(b.cut_depth)} max` : ''}`
    case 'compound':
      return 'molding'
  }
}

export function RouterPanel() {
  const bits = useBits()
  const routerBitId = useModelStore((s) => s.routerBitId)
  const setRouterBit = useModelStore((s) => s.setRouterBit)
  const [adding, setAdding] = useState(false)

  return (
    <div
      style={{
        position: 'absolute', left: 'var(--sp-3)', top: 'var(--sp-3)', zIndex: 12,
        width: 250, maxHeight: 'calc(100% - 2 * var(--sp-3))',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface-overlay)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-m)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 'var(--text-xs)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--sp-2) var(--sp-3)', borderBottom: '1px solid var(--border)',
        fontWeight: 600, fontSize: 'var(--text-sm)',
      }}>
        <span>Router bits</span>
        <button onClick={() => useModelStore.getState().setMode('select')} title="Exit router (Esc)" style={iconBtn}>✕</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--sp-1)' }}>
        {bits.length === 0 && <div style={{ padding: 'var(--sp-2)', color: 'var(--text-faint)' }}>Loading bits…</div>}
        {bits.map((b) => (
          <button
            key={b.id}
            onClick={() => setRouterBit(b.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)', width: '100%',
              padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-s)', cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left', fontSize: 'var(--text-xs)',
              background: routerBitId === b.id ? 'var(--accent-soft, var(--surface-sunken))' : 'transparent',
              color: routerBitId === b.id ? 'var(--accent)' : 'var(--text)',
              outline: routerBitId === b.id ? '1px solid var(--accent)' : 'none',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
            <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{bitDims(b)}</span>
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 'var(--sp-2)' }}>
        {adding ? (
          <AddBitForm onDone={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)} style={{ ...ghostBtn, width: '100%' }}>+ Add bit</button>
        )}
      </div>

      <div style={{ padding: '4px var(--sp-3) var(--sp-2)', color: 'var(--text-faint)' }}>
        {routerBitId ? 'Click an arris to route · click again to clear' : 'Pick a bit, then click an arris'}
      </div>
    </div>
  )
}

function AddBitForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [profile, setProfile] = useState<(typeof PROFILES)[number]>('roundover')
  const [size, setSize] = useState('0.25')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dimKey = profile === 'chamfer' || profile === 'rabbet' ? 'cut_width' : 'radius'

  async function submit() {
    const val = Number(size)
    if (!name.trim() || !Number.isFinite(val) || val <= 0) {
      setErr('name + a positive size are required')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const created = await addBit({
        id: `bit_${makeEdgeProfileId().slice(4)}`, // reuse the nanoid generator for a unique slug
        name: name.trim(),
        profile,
        radius: dimKey === 'radius' ? val : null,
        angle_deg: profile === 'chamfer' ? 45 : null,
        cut_width: dimKey === 'cut_width' ? val : null,
        cut_depth: profile === 'rabbet' ? val : null,
        shank: '1/4',
        brand: null,
        notes: null,
        profile_geom: null, // the add form makes primitive bits only; compound bits are seeded/imported
      })
      useModelStore.getState().setRouterBit(created.id)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to add bit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={field} />
      <select value={profile} onChange={(e) => setProfile(e.target.value as typeof profile)} style={field}>
        {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input placeholder={dimKey === 'radius' ? 'radius (in)' : 'width (in)'} value={size} onChange={(e) => setSize(e.target.value)} style={field} />
      {err && <span style={{ color: 'var(--danger, #d33)' }}>{err}</span>}
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={submit} disabled={busy} style={{ ...ghostBtn, flex: 1 }}>{busy ? '…' : 'Save'}</button>
        <button onClick={onDone} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 20, height: 20, border: 'none', background: 'transparent',
  color: 'var(--text-faint)', cursor: 'pointer', borderRadius: 'var(--radius-s)', fontSize: 13,
}
const ghostBtn: React.CSSProperties = {
  height: 26, padding: '0 var(--sp-2)', borderRadius: 'var(--radius-s)',
  border: '1px solid var(--border-strong)', background: 'var(--surface-sunken)',
  color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'inherit',
}
const field: React.CSSProperties = {
  height: 26, padding: '0 6px', borderRadius: 'var(--radius-s)',
  border: '1px solid var(--border-strong)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: 'var(--text-xs)', fontFamily: 'inherit',
}
