import { useSettings } from './hooks/useSettings.js'
import type { Settings } from './lib/api.js'

// Pill-style toggle group used for theme and density selection.
function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
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
      borderRadius: 'var(--radius-m)',
      overflow: 'hidden',
    }}>
      {options.map((opt, idx) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          style={{
            padding: '0 var(--sp-3)',
            height: 'var(--btn-height-comfortable)',
            border: 'none',
            borderRight: idx < options.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 'var(--text-sm)',
            background: value === opt.value ? 'var(--accent)' : 'var(--surface)',
            color: value === opt.value ? 'var(--text-on-accent)' : 'var(--text-muted)',
            fontWeight: value === opt.value ? 600 : 400,
            transition: `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function App() {
  const { settings, loading, error, update } = useSettings()

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update({ [key]: value } as Partial<Settings>)

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--surface)',
      color: 'var(--text)',
      fontFamily: 'system-ui, sans-serif',
      padding: 'var(--sp-8)',
    }}>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--sp-2)', color: 'var(--text)' }}>
        Tenon
      </h1>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-8)' }}>
        Parametric woodworking design and job management
      </p>

      {error && (
        <div style={{
          background: 'var(--accent-subtle)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-m)',
          padding: 'var(--sp-3) var(--sp-4)',
          marginBottom: 'var(--sp-6)',
          fontSize: 'var(--text-sm)',
        }}>
          {error} — theme controls use local defaults until the server is reachable.
        </div>
      )}

      <section style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-6)', color: 'var(--text)' }}>
          Appearance
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
              Theme
            </label>
            <SegmentedControl
              value={settings?.theme}
              disabled={loading}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light',  label: 'Light' },
                { value: 'dark',   label: 'Dark' },
              ]}
              onChange={v => set('theme', v)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
              Density
            </label>
            <SegmentedControl
              value={settings?.density}
              disabled={loading}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'shop',        label: 'Shop' },
              ]}
              onChange={v => set('density', v)}
            />
            {settings?.density === 'shop' && (
              <p style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                Larger text and hit targets for bench use
              </p>
            )}
          </div>
        </div>

        <div style={{
          marginTop: 'var(--sp-8)',
          padding: 'var(--sp-4)',
          borderRadius: 'var(--radius-m)',
          border: '1px solid var(--border)',
          background: 'var(--surface-sunken)',
        }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', margin: 0 }}>
            Design token swatch — chunk 5 foundation
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {(['accent', 'danger', 'warn', 'ok', 'info'] as const).map(name => (
              <div key={name} style={{
                width: 28, height: 28,
                borderRadius: 'var(--radius-s)',
                background: `var(--${name})`,
              }} />
            ))}
          </div>
        </div>
      </section>

      {/* Chunk 6: PWA shell + command registry + jobs UI */}
      {/* Chunk 7: Viewport (react-three-fiber) */}
    </div>
  )
}
