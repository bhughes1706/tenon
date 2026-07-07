import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Plus } from 'lucide-react'
import { getModels, createModel } from '../lib/jobsApi.js'
import type { ModelMeta } from '../lib/jobsApi.js'

export function ModelsPage() {
  const navigate = useNavigate()
  const [models, setModels] = useState<ModelMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getModels()
      .then(setModels)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load models'))
      .finally(() => setLoading(false))
  }, [])

  const newModel = async () => {
    setCreating(true)
    try {
      const model = await createModel({ name: 'Untitled' })
      navigate(`/designer/${model.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create model')
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '0 var(--sp-6)', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <h1 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Models</h1>
        <button onClick={newModel} disabled={creating} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
          height: 32, padding: '0 var(--sp-3)',
          border: 'none', borderRadius: 'var(--radius-s)',
          background: 'var(--accent)', color: 'var(--text-on-accent)',
          cursor: creating ? 'wait' : 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
          fontFamily: 'inherit', opacity: creating ? 0.7 : 1,
        }}>
          <Plus size={14} /> New model
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-4) var(--sp-6)' }}>
        {loading && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {error  && <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{error}</div>}
        {!loading && !error && models.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>
            No models yet. Click "New model" to start designing.
          </div>
        )}
        {models.map(m => (
          <Link key={m.id} to={`/designer/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
              padding: 'var(--sp-3) var(--sp-4)',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              transition: `background var(--dur-fast) var(--ease-out)`,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sunken)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Box size={16} color="var(--text-faint)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>rev {m.rev}</div>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
                {new Date(m.updated_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
