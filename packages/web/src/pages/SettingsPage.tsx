import { useAppCtx } from '../lib/AppContext.js'
import { useSettings } from '../hooks/useSettings.js'
import type { Settings } from '../lib/api.js'

function SegmentedControl<T extends string>({
  value, options, onChange, disabled,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-m)', overflow: 'hidden',
    }}>
      {options.map((opt, idx) => (
        <button key={opt.value} onClick={() => onChange(opt.value)} disabled={disabled} style={{
          padding: '0 var(--sp-3)', height: 'var(--btn-height-comfortable)',
          border: 'none',
          borderRight: idx < options.length - 1 ? '1px solid var(--border)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 'var(--text-sm)',
          background: value === opt.value ? 'var(--accent)' : 'var(--surface)',
          color: value === opt.value ? 'var(--text-on-accent)' : 'var(--text-muted)',
          fontWeight: value === opt.value ? 600 : 400,
          transition: `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)`,
        }}>{opt.label}</button>
      ))}
    </div>
  )
}

export function SettingsPage() {
  const { settings, loading, error, update } = useSettings()
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update({ [key]: value } as Partial<Settings>)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '0 var(--sp-6)', height: 56,
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxWidth: 480, padding: 'var(--sp-8) var(--sp-6)' }}>
        {error && (
          <div style={{
            background: 'var(--accent-subtle)', color: 'var(--danger)',
            border: '1px solid var(--danger)', borderRadius: 'var(--radius-m)',
            padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-6)', fontSize: 'var(--text-sm)',
          }}>
            {error} — using local defaults until server is reachable.
          </div>
        )}

        {/* Appearance */}
        <section style={{ marginBottom: 'var(--sp-8)' }}>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-6)', color: 'var(--text)' }}>
            Appearance
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>Theme</label>
              <SegmentedControl value={settings?.theme} disabled={loading}
                options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
                onChange={v => set('theme', v)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>Density</label>
              <SegmentedControl value={settings?.density} disabled={loading}
                options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'shop', label: 'Shop' }]}
                onChange={v => set('density', v)} />
              {settings?.density === 'shop' && (
                <p style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                  Larger text and hit targets for bench use
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Designer */}
        <section style={{ marginBottom: 'var(--sp-8)' }}>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-6)', color: 'var(--text)' }}>
            Designer
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>Fraction precision</label>
              <SegmentedControl value={settings?.fraction_precision?.toString()} disabled={loading}
                options={[{ value: '16', label: '1/16"' }, { value: '32', label: '1/32"' }, { value: '64', label: '1/64"' }]}
                onChange={v => set('fraction_precision', parseInt(v) as 16 | 32 | 64)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>Viewport shadows</label>
              <SegmentedControl value={settings?.viewport_shadows ? 'on' : 'off'} disabled={loading}
                options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
                onChange={v => set('viewport_shadows', v === 'on')} />
            </div>
          </div>
        </section>

        {/* Business */}
        <section>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-6)', color: 'var(--text)' }}>
            Business
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 120 }}>Labor rate</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={settings?.labor_rate ?? ''}
                  placeholder="—"
                  onChange={e => set('labor_rate', e.target.value ? parseFloat(e.target.value) : null)}
                  style={{
                    width: 80, background: 'var(--surface-sunken)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
                    padding: '3px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                  }}
                />
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>/hr</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 120 }}>Default deposit</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" min="0" max="100" step="1"
                  value={settings?.default_deposit_pct ?? ''}
                  placeholder="—"
                  onChange={e => set('default_deposit_pct', e.target.value ? parseFloat(e.target.value) : null)}
                  style={{
                    width: 60, background: 'var(--surface-sunken)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-s)',
                    padding: '3px var(--sp-2)', fontSize: 'var(--text-sm)', color: 'var(--text)',
                    fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                  }}
                />
                <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>%</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
